/**
 * The sound source for settings that move with music (see docs/AUDIO.md):
 * an output device (the sound that the PC plays now, from any app) or an
 * input device (a microphone or a line-in). Both are a shared-mode WASAPI
 * capture stream; an output device is captured in loopback mode. Windows
 * cannot capture one app only. Windows wakes a thread for each block of
 * sound (event mode, about every 10 ms); the thread mixes the block to
 * mono and sends it to the webview at once as raw 32-bit floats
 * (little-endian), where src/engine/audio.ts analyzes it. (A first
 * version read the stream every 20 ms; with its analysis, the meters
 * reacted 80 to 100 ms after the sound.)
 */
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};

/**
 * The longest wait for the next block. An output device sends no blocks
 * while nothing plays; after this wait the thread sends this much silence,
 * so the levels fall to zero.
 */
const SILENCE_WAIT_MS: u32 = 20;
/** How often the thread checks whether Windows has a new default device. */
const DEVICE_CHECK: Duration = Duration::from_secs(1);
/** The wait before the thread opens the stream again after it failed or the device changed. */
const REOPEN_DELAY: Duration = Duration::from_millis(500);

/** The running capture, if any. */
#[derive(Default)]
pub struct SoundCapture(Mutex<Option<Capture>>);

struct Capture {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

impl Capture {
    fn end(self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = self.thread.join();
    }
}

/** An output device (its sound is captured in loopback mode), or an input device. */
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
    Output,
    Input,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundDevice {
    id: String,
    name: String,
    kind: DeviceKind,
    /** The Windows default device of its kind. */
    default: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInfo {
    sample_rate: u32,
    device_name: String,
}

/** A change after the start: the stream opened again (on a new device, or after an error), or it failed. */
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CaptureStatus {
    Open { sample_rate: u32, device_name: String },
    Error { message: String },
}

/** The output devices, then the input devices; the default one of each kind first. */
#[tauri::command]
pub fn sound_devices() -> Result<Vec<SoundDevice>, String> {
    std::thread::spawn(|| -> Result<Vec<SoundDevice>, String> {
        #[cfg(windows)]
        {
            let _com = wasapi::Com::start()?;
            let mut list = wasapi::devices(DeviceKind::Output)?;
            list.extend(wasapi::devices(DeviceKind::Input)?);
            Ok(list)
        }
        #[cfg(not(windows))]
        {
            Ok(Vec::new())
        }
    })
    .join()
    .map_err(|_| "The device list failed.".to_string())?
}

/**
 * Starts the capture on "device" (an id from sound_devices), or on the
 * default device of "kind", which it then follows when Windows changes
 * it. A capture that runs already stops first. Returns when the stream is
 * open, with its sample rate.
 */
#[tauri::command]
pub async fn sound_start(
    state: tauri::State<'_, SoundCapture>,
    device: Option<String>,
    kind: DeviceKind,
    samples: Channel<InvokeResponseBody>,
    status: Channel<CaptureStatus>,
) -> Result<CaptureInfo, String> {
    let old = state.0.lock().map_err(|error| error.to_string())?.take();
    if let Some(old) = old {
        old.end();
    }
    let stop = Arc::new(AtomicBool::new(false));
    let (first_tx, first_rx) = mpsc::channel();
    let thread_stop = stop.clone();
    let thread = std::thread::spawn(move || run(device, kind, samples, status, thread_stop, first_tx));
    let first = tauri::async_runtime::spawn_blocking(move || first_rx.recv_timeout(Duration::from_secs(5)))
        .await
        .map_err(|error| error.to_string())?;
    let capture = Capture { stop, thread };
    match first {
        Ok(Ok(info)) => {
            *state.0.lock().map_err(|error| error.to_string())? = Some(capture);
            Ok(info)
        }
        Ok(Err(message)) => {
            capture.end();
            Err(message)
        }
        Err(_) => {
            capture.end();
            Err("The sound did not start in time.".to_string())
        }
    }
}

#[tauri::command]
pub fn sound_stop(state: tauri::State<'_, SoundCapture>) -> Result<(), String> {
    let old = state.0.lock().map_err(|error| error.to_string())?.take();
    if let Some(old) = old {
        old.end();
    }
    Ok(())
}

/**
 * The capture thread: opens the stream, reads it until "stop", and opens
 * it again when the device changes or the stream fails. The first open
 * reports to "first"; later ones report to "status".
 */
fn run(
    device: Option<String>,
    kind: DeviceKind,
    samples: Channel<InvokeResponseBody>,
    status: Channel<CaptureStatus>,
    stop: Arc<AtomicBool>,
    first: mpsc::Sender<Result<CaptureInfo, String>>,
) {
    #[cfg(windows)]
    {
        let _com = match wasapi::Com::start() {
            Ok(com) => com,
            Err(message) => {
                let _ = first.send(Err(message));
                return;
            }
        };
        let mut first = Some(first);
        while !stop.load(Ordering::Relaxed) {
            match wasapi::Stream::open(device.as_deref(), kind) {
                Ok(stream) => {
                    let info = stream.info();
                    match first.take() {
                        Some(first) => {
                            let _ = first.send(Ok(info));
                        }
                        None => {
                            let _ = status.send(CaptureStatus::Open { sample_rate: info.sample_rate, device_name: info.device_name });
                        }
                    }
                    if let Err(message) = stream.read_until_stop(&samples, &stop, device.is_none()) {
                        let _ = status.send(CaptureStatus::Error { message });
                    }
                }
                Err(message) => {
                    if let Some(first) = first.take() {
                        let _ = first.send(Err(message));
                        return;
                    }
                    let _ = status.send(CaptureStatus::Error { message });
                }
            }
            std::thread::sleep(REOPEN_DELAY);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (device, kind, samples, status, stop);
        let _ = first.send(Err("Sound capture needs Windows.".to_string()));
    }
}

/** The sample layout of a stream. */
#[derive(Clone, Copy, Debug, PartialEq)]
enum SampleKind {
    Float32,
    Int16,
    Int24,
    Int32,
}

impl SampleKind {
    fn bytes(self) -> usize {
        match self {
            SampleKind::Float32 | SampleKind::Int32 => 4,
            SampleKind::Int16 => 2,
            SampleKind::Int24 => 3,
        }
    }

    fn read(self, bytes: &[u8]) -> f32 {
        match self {
            SampleKind::Float32 => f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
            SampleKind::Int16 => i16::from_le_bytes([bytes[0], bytes[1]]) as f32 / 32768.0,
            SampleKind::Int24 => (i32::from_le_bytes([0, bytes[0], bytes[1], bytes[2]]) >> 8) as f32 / 8_388_608.0,
            SampleKind::Int32 => i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as f32 / 2_147_483_648.0,
        }
    }
}

/** Interleaved frames of "channels" samples each, mixed to mono, as little-endian 32-bit floats. */
fn mono_bytes(data: &[u8], kind: SampleKind, channels: usize) -> Vec<u8> {
    let frame = kind.bytes() * channels;
    let mut out = Vec::with_capacity(data.len() / frame.max(1) * 4);
    for frame_bytes in data.chunks_exact(frame) {
        let sum: f32 = frame_bytes.chunks_exact(kind.bytes()).map(|sample| kind.read(sample)).sum();
        out.extend_from_slice(&(sum / channels as f32).to_le_bytes());
    }
    out
}

#[cfg(windows)]
mod wasapi {
    use super::*;
    use windows::core::PWSTR;
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, eRender, EDataFlow, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_LOOPBACK,
        DEVICE_STATE_ACTIVE,
        WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    };
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToStringAlloc};
    use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
    };

    const WAVE_FORMAT_PCM: u16 = 1;
    const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u16 = 0xfffe;
    /**
     * The stream's buffer: 20 ms, in 100-nanosecond units. The thread
     * reads each block as soon as Windows signals it, so the buffer only
     * needs room for a late wake-up.
     */
    const BUFFER_DURATION: i64 = 200_000;

    /** COM for this thread, for as long as the value lives. */
    pub struct Com;

    impl Com {
        pub fn start() -> Result<Com, String> {
            unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.ok().map_err(|error| error.to_string())?;
            Ok(Com)
        }
    }

    impl Drop for Com {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    fn text(error: windows::core::Error) -> String {
        error.message().to_string()
    }

    /** E_ACCESSDENIED: Windows privacy settings block the microphone for desktop apps. */
    const ACCESS_DENIED: i32 = 0x8007_0005_u32 as i32;

    fn flow(kind: DeviceKind) -> EDataFlow {
        match kind {
            DeviceKind::Output => eRender,
            DeviceKind::Input => eCapture,
        }
    }

    fn default_device(enumerator: &IMMDeviceEnumerator, kind: DeviceKind) -> Option<IMMDevice> {
        unsafe { enumerator.GetDefaultAudioEndpoint(flow(kind), eConsole) }.ok()
    }

    fn enumerator() -> Result<IMMDeviceEnumerator, String> {
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }.map_err(text)
    }

    /** A COM string, freed after it is copied. */
    unsafe fn take_string(value: PWSTR) -> String {
        let text = value.to_string().unwrap_or_default();
        CoTaskMemFree(Some(value.0 as *const _));
        text
    }

    fn device_id(device: &IMMDevice) -> Result<String, String> {
        unsafe { Ok(take_string(device.GetId().map_err(text)?)) }
    }

    fn device_name(device: &IMMDevice) -> String {
        unsafe {
            let Ok(store) = device.OpenPropertyStore(STGM_READ) else { return String::new() };
            let Ok(mut value) = store.GetValue(&PKEY_Device_FriendlyName) else { return String::new() };
            let name = PropVariantToStringAlloc(&value).map(|name| take_string(name)).unwrap_or_default();
            let _ = PropVariantClear(&mut value);
            name
        }
    }

    /** The active devices of one kind, the default one first. */
    pub fn devices(kind: DeviceKind) -> Result<Vec<SoundDevice>, String> {
        let enumerator = enumerator()?;
        let default_id = default_device(&enumerator, kind).and_then(|device| device_id(&device).ok());
        let collection = unsafe { enumerator.EnumAudioEndpoints(flow(kind), DEVICE_STATE_ACTIVE) }.map_err(text)?;
        let count = unsafe { collection.GetCount() }.map_err(text)?;
        let mut list = Vec::new();
        for index in 0..count {
            let device = unsafe { collection.Item(index) }.map_err(text)?;
            let id = device_id(&device)?;
            list.push(SoundDevice { default: default_id.as_deref() == Some(id.as_str()), name: device_name(&device), kind, id });
        }
        list.sort_by_key(|device| !device.default);
        Ok(list)
    }

    /** An open capture stream: loopback on an output device, or plain on an input device. */
    pub struct Stream {
        client: IAudioClient,
        /** Signaled by Windows when a block of sound is ready (event mode). */
        event: HANDLE,
        device_kind: DeviceKind,
        capture: IAudioCaptureClient,
        device_id: String,
        device_name: String,
        sample_rate: u32,
        channels: usize,
        kind: SampleKind,
    }

    impl Stream {
        /** Opens the capture stream on the device with "id", or on the default device of "device_kind". */
        pub fn open(id: Option<&str>, device_kind: DeviceKind) -> Result<Stream, String> {
            let enumerator = enumerator()?;
            let device = match id {
                Some(id) => unsafe { enumerator.GetDevice(&windows::core::HSTRING::from(id)) }.ok(),
                None => default_device(&enumerator, device_kind),
            }
            .ok_or_else(|| match device_kind {
                DeviceKind::Output => "No sound output device was found.".to_string(),
                DeviceKind::Input => "No microphone or line input was found.".to_string(),
            })?;
            let flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK | if device_kind == DeviceKind::Output { AUDCLNT_STREAMFLAGS_LOOPBACK } else { 0 };
            let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None) }.map_err(text)?;
            let format_pointer = unsafe { client.GetMixFormat() }.map_err(text)?;
            let format = unsafe { std::ptr::read_unaligned(format_pointer) };
            let result: Result<SampleKind, String> = (|| {
                let kind = sample_kind(format_pointer, &format)?;
                unsafe {
                    client.Initialize(AUDCLNT_SHAREMODE_SHARED, flags, BUFFER_DURATION, 0, format_pointer, None).map_err(|error| {
                        if error.code().0 == ACCESS_DENIED && device_kind == DeviceKind::Input {
                            "Windows blocks the microphone. Turn on Settings, Privacy & security, Microphone, \"Let desktop apps access your microphone\".".to_string()
                        } else {
                            text(error)
                        }
                    })?;
                }
                Ok(kind)
            })();
            unsafe { CoTaskMemFree(Some(format_pointer as *const _)) };
            let kind = result?;
            let capture: IAudioCaptureClient = unsafe { client.GetService() }.map_err(text)?;
            let event = unsafe { CreateEventW(None, false, false, None) }.map_err(text)?;
            let started = unsafe { client.SetEventHandle(event).and_then(|()| client.Start()) };
            if let Err(error) = started {
                unsafe { let _ = CloseHandle(event); }
                return Err(text(error));
            }
            Ok(Stream {
                event,
                device_kind,
                device_id: device_id(&device)?,
                device_name: device_name(&device),
                client,
                capture,
                sample_rate: format.nSamplesPerSec,
                channels: format.nChannels.max(1) as usize,
                kind,
            })
        }

        /** Waits until Windows signals the next block, or SILENCE_WAIT_MS. A timeout is no error: the packets are read either way (Windows may not signal a loopback stream). */
        pub fn wait(&self) {
            unsafe { WaitForSingleObject(self.event, SILENCE_WAIT_MS) };
        }

        /** Reads every packet that is ready: the samples, mixed to mono, and the packet count. */
        pub fn read_packets(&self) -> Result<(Vec<u8>, usize), String> {
            let mut bytes = Vec::new();
            let mut packets = 0;
            loop {
                let packet = unsafe { self.capture.GetNextPacketSize() }.map_err(text)?;
                if packet == 0 {
                    break;
                }
                let mut data: *mut u8 = std::ptr::null_mut();
                let mut frames = 0u32;
                let mut flags = 0u32;
                unsafe { self.capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }.map_err(text)?;
                let length = frames as usize * self.channels * self.kind.bytes();
                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                    bytes.resize(bytes.len() + frames as usize * 4, 0);
                } else {
                    bytes.extend(mono_bytes(unsafe { std::slice::from_raw_parts(data, length) }, self.kind, self.channels));
                }
                unsafe { self.capture.ReleaseBuffer(frames) }.map_err(text)?;
                packets += 1;
            }
            Ok((bytes, packets))
        }

        pub fn info(&self) -> CaptureInfo {
            CaptureInfo { sample_rate: self.sample_rate, device_name: self.device_name.clone() }
        }

        /**
         * Sends each block of samples as soon as Windows signals it, until
         * "stop". While nothing plays, an output device sends no blocks;
         * after SILENCE_WAIT_MS the stream sends silence, so the levels
         * fall to zero. With "follow_default", it returns when Windows has
         * a new default device of its kind, so the caller can open that one.
         */
        pub fn read_until_stop(&self, samples: &Channel<InvokeResponseBody>, stop: &AtomicBool, follow_default: bool) -> Result<(), String> {
            let silence = vec![0u8; (self.sample_rate * SILENCE_WAIT_MS / 1000) as usize * 4];
            let mut checked = std::time::Instant::now();
            while !stop.load(Ordering::Relaxed) {
                self.wait();
                let (bytes, packets) = self.read_packets()?;
                let message = if packets == 0 { silence.clone() } else { bytes };
                if !message.is_empty() {
                    samples.send(InvokeResponseBody::Raw(message)).map_err(|error| error.to_string())?;
                }
                if follow_default && checked.elapsed() >= DEVICE_CHECK {
                    checked = std::time::Instant::now();
                    let current = enumerator()
                        .ok()
                        .and_then(|enumerator| default_device(&enumerator, self.device_kind))
                        .and_then(|device| device_id(&device).ok());
                    if current.is_some_and(|id| id != self.device_id) {
                        return Ok(());
                    }
                }
            }
            Ok(())
        }
    }

    impl Drop for Stream {
        fn drop(&mut self) {
            unsafe {
                let _ = self.client.Stop();
                let _ = CloseHandle(self.event);
            }
        }
    }

    /** The stream's sample layout, from its mix format (usually 32-bit float). */
    fn sample_kind(pointer: *const WAVEFORMATEX, format: &WAVEFORMATEX) -> Result<SampleKind, String> {
        let bits = format.wBitsPerSample;
        let tag = match format.wFormatTag {
            WAVE_FORMAT_EXTENSIBLE => {
                let extended = unsafe { std::ptr::read_unaligned(pointer as *const WAVEFORMATEXTENSIBLE) };
                /* The sub-format GUID's first part is the plain format tag. */
                let sub = extended.SubFormat;
                sub.data1 as u16
            }
            tag => tag,
        };
        match (tag, bits) {
            (WAVE_FORMAT_IEEE_FLOAT, 32) => Ok(SampleKind::Float32),
            (WAVE_FORMAT_PCM, 16) => Ok(SampleKind::Int16),
            (WAVE_FORMAT_PCM, 24) => Ok(SampleKind::Int24),
            (WAVE_FORMAT_PCM, 32) => Ok(SampleKind::Int32),
            _ => Err(format!("The sound output uses a format that Kaleido Sage cannot read ({tag}, {bits} bits).")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn floats(bytes: &[u8]) -> Vec<f32> {
        bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect()
    }

    #[test]
    fn stereo_floats_mix_to_mono() {
        let data: Vec<u8> = [0.5f32, -0.5, 1.0, 0.0].iter().flat_map(|value| value.to_le_bytes()).collect();
        assert_eq!(floats(&mono_bytes(&data, SampleKind::Float32, 2)), vec![0.0, 0.5]);
    }

    #[test]
    fn integer_samples_become_floats() {
        let data: Vec<u8> = [i16::MIN, 16384].iter().flat_map(|value| value.to_le_bytes()).collect();
        assert_eq!(floats(&mono_bytes(&data, SampleKind::Int16, 1)), vec![-1.0, 0.5]);
        /* 24-bit: -8388608 is the lowest value, little-endian in three bytes. */
        assert_eq!(floats(&mono_bytes(&[0x00, 0x00, 0x80], SampleKind::Int24, 1)), vec![-1.0]);
    }

    /** Needs a sound device, so it runs only on request: cargo test -- --ignored */
    #[test]
    #[ignore]
    #[cfg(windows)]
    fn opens_the_default_output() {
        let _com = wasapi::Com::start().unwrap();
        let stream = wasapi::Stream::open(None, DeviceKind::Output).expect("no loopback stream");
        assert!(stream.info().sample_rate >= 8000);
        assert!(!wasapi::devices(DeviceKind::Output).unwrap().is_empty());
    }

    /** Needs a microphone or line input that Windows lets desktop apps use: cargo test -- --ignored */
    #[test]
    #[ignore]
    #[cfg(windows)]
    fn opens_the_default_input() {
        let _com = wasapi::Com::start().unwrap();
        let stream = wasapi::Stream::open(None, DeviceKind::Input).expect("no input stream");
        assert!(stream.info().sample_rate >= 8000);
        /* A device can take a moment to start (a webcam microphone took about 0.5 s); then blocks come about every 10 ms. */
        let warm = std::time::Instant::now();
        while warm.elapsed() < Duration::from_secs(1) {
            stream.wait();
            stream.read_packets().unwrap();
        }
        let started = std::time::Instant::now();
        let mut frames = 0;
        let mut last = started;
        let mut longest = Duration::ZERO;
        while started.elapsed() < Duration::from_secs(1) {
            stream.wait();
            let block = stream.read_packets().unwrap().0.len() / 4;
            if block > 0 {
                longest = longest.max(last.elapsed());
                last = std::time::Instant::now();
            }
            frames += block;
        }
        let seconds = frames as f64 / stream.info().sample_rate as f64;
        println!("{seconds:.3} s of sound in 1 s; longest gap between blocks {longest:?}");
        assert!(seconds > 0.9, "only {seconds} s of sound arrived in 1 s");
        assert!(longest < Duration::from_millis(30), "a gap of {longest:?} between blocks");
    }
}
