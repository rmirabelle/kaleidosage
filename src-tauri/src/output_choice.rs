/**
 * The speaker list of the Output menu (src/lib/audioOutput.ts). The webview
 * names its speakers, and lets the page play to one of them
 * (AudioContext.setSinkId), only while the page may use the microphone.
 * This command gives that permission to the app's own page, with no
 * question from the webview. It records nothing: Windows shows its
 * microphone icon only while a page captures sound, and the page never
 * does (the app captures sound in Rust, see sound_capture.rs).
 */
use std::time::Duration;

/** The longest wait for the webview to save the permission. */
const ANSWER_WAIT: Duration = Duration::from_secs(5);

/** Gives the page at "origin" the microphone permission. Only the webview's own page may ask. */
#[tauri::command]
pub async fn allow_output_choice(webview: tauri::Webview, origin: String) -> Result<(), String> {
    let own = webview.url().map_err(|error| error.to_string())?.origin().ascii_serialization();
    if own != origin {
        return Err(format!("The page {origin} is not the app's page."));
    }
    #[cfg(windows)]
    {
        let (answer, answered) = std::sync::mpsc::channel();
        webview
            .with_webview(move |platform| {
                if let Err(error) = webview2::allow_microphone(platform.controller(), &origin, answer.clone()) {
                    let _ = answer.send(Err(error));
                }
            })
            .map_err(|error| error.to_string())?;
        tauri::async_runtime::spawn_blocking(move || answered.recv_timeout(ANSWER_WAIT))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|_| "The webview did not answer.".to_string())?
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[cfg(windows)]
mod webview2 {
    use std::sync::mpsc::Sender;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller, ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::SetPermissionStateCompletedHandler;
    use windows_core::{Interface, HSTRING, PCWSTR};

    /**
     * Saves "allow" for the microphone at "origin" in the webview's profile
     * (ICoreWebView2Profile4, WebView2 1.0.1938 and later). "answer" gets the
     * result when the webview has saved it. Runs on the webview's thread.
     */
    pub fn allow_microphone(controller: ICoreWebView2Controller, origin: &str, answer: Sender<Result<(), String>>) -> Result<(), String> {
        let text = |error: windows_core::Error| error.to_string();
        unsafe {
            let profile = controller
                .CoreWebView2()
                .map_err(text)?
                .cast::<ICoreWebView2_13>()
                .map_err(text)?
                .Profile()
                .map_err(text)?
                .cast::<ICoreWebView2Profile4>()
                .map_err(|_| "This WebView2 runtime is too old to pick a speaker.".to_string())?;
            let handler = SetPermissionStateCompletedHandler::create(Box::new(move |result| {
                let _ = answer.send(result.map_err(text));
                Ok(())
            }));
            let origin = HSTRING::from(origin);
            profile
                .SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    PCWSTR(origin.as_ptr()),
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    &handler,
                )
                .map_err(text)
        }
    }
}
