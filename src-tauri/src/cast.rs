/**
 * Cast (see src/lib/cast.ts): a second window, the Show window, that shows
 * the picture full screen on another screen, for example a virtual screen
 * that a stream sends to a projector. The page opens it with window.open,
 * so the Show window shares the page's scripts: the engine draws in the
 * main window and copies each frame into the Show window. Rust makes the
 * window (on_new_window, see lib.rs), puts it on the picked screen and
 * names the screens.
 */
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/** The Show window's label. The page opens it with window.open("about:blank", ...). */
pub const SHOW_LABEL: &str = "show";

/** The screen for the next Show window (see cast_target), by its Windows device name. */
#[derive(Default)]
pub struct CastTarget(Mutex<Option<String>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CastScreen {
    /** The Windows device name, for example \\.\DISPLAY2. It can change when the screens change. */
    id: String,
    /** The monitor's own name, for example "LG ULTRAGEAR+", or the device name when Windows has none. */
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    /** True for the screen that the main window is on now. */
    current: bool,
}

/** The screens, with their monitors' names, in Windows' order. */
#[tauri::command]
pub fn cast_screens<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CastScreen>, String> {
    let main = app.get_webview_window("main").ok_or("The main window is gone.")?;
    let current = main.current_monitor().ok().flatten().and_then(|monitor| monitor.name().cloned());
    let names = monitor_names();
    let monitors = main.available_monitors().map_err(|error| error.to_string())?;
    Ok(monitors
        .into_iter()
        .map(|monitor| {
            let id = monitor.name().cloned().unwrap_or_default();
            CastScreen {
                name: names.iter().find(|(device, _)| *device == id).map(|(_, name)| name.clone()).unwrap_or_else(|| id.clone()),
                width: monitor.size().width,
                height: monitor.size().height,
                x: monitor.position().x,
                y: monitor.position().y,
                current: current.as_deref() == Some(id.as_str()),
                id,
            }
        })
        .collect())
}

/** Sets the screen for the next Show window; the page calls it right before window.open. */
#[tauri::command]
pub fn cast_target(state: tauri::State<'_, CastTarget>, screen: String) -> Result<(), String> {
    *state.0.lock().map_err(|error| error.to_string())? = Some(screen);
    Ok(())
}

/**
 * Puts the Show window on its screen, full screen, and shows it without
 * taking the focus. The page calls it once the window is open. Moving and
 * sizing it here, after it exists, keeps its size right when the two
 * screens have different scales.
 */
#[tauri::command]
pub async fn cast_place<R: Runtime>(app: AppHandle<R>, screen: String) -> Result<(), String> {
    let show = app.get_webview_window(SHOW_LABEL).ok_or("The Show window is not open.")?;
    let monitor = show
        .available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|monitor| monitor.name().is_some_and(|name| *name == screen))
        .ok_or("That screen is not connected.")?;
    let text = |error: tauri::Error| error.to_string();
    show.set_position(*monitor.position()).map_err(text)?;
    show.set_size(*monitor.size()).map_err(text)?;
    show.set_fullscreen(true).map_err(text)?;
    show.show().map_err(text)?;
    /* The show plays on the other screen; the user goes on in the main window. */
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(())
}

/**
 * Closes the Show window. The page's window.close() ends only the page and
 * leaves Tauri's window open and black, over the cast screen; a second
 * cast then finds the label taken.
 */
#[tauri::command]
pub fn cast_close<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    match app.get_webview_window(SHOW_LABEL) {
        Some(show) => show.destroy().map_err(|error| error.to_string()),
        None => Ok(()),
    }
}

/**
 * The window that window.open makes (see lib.rs): only the Show window, an
 * empty page that the main page fills. Its webview must share the main
 * webview's environment (window_features does that), or window.open
 * returns no window. It starts hidden; cast_place shows it.
 */
pub fn show_window<R: Runtime>(app: &AppHandle<R>, url: &tauri::Url, features: tauri::webview::NewWindowFeatures) -> Option<WebviewWindow<R>> {
    if url.as_str() != "about:blank" || app.get_webview_window(SHOW_LABEL).is_some() {
        return None;
    }
    app.state::<CastTarget>().0.lock().ok()?.take()?;
    WebviewWindowBuilder::new(app, SHOW_LABEL, WebviewUrl::External(url.clone()))
        .window_features(features)
        .title("Kaleido Sage Show")
        .decorations(false)
        .resizable(false)
        .shadow(false)
        .skip_taskbar(true)
        /* Nothing else may show on the cast screen while the show plays. */
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()
        .ok()
}

/** The monitors' own names, by their Windows device name (\\.\DISPLAY2 and so on). */
#[cfg(windows)]
fn monitor_names() -> Vec<(String, String)> {
    use windows::Win32::Devices::Display::{
        DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
        DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
        DISPLAYCONFIG_TARGET_DEVICE_NAME, QDC_ONLY_ACTIVE_PATHS,
    };
    let text = |chars: &[u16]| String::from_utf16_lossy(&chars[..chars.iter().position(|&c| c == 0).unwrap_or(chars.len())]);
    let mut names = Vec::new();
    unsafe {
        let (mut path_count, mut mode_count) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count).is_err() {
            return names;
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        if QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut path_count, paths.as_mut_ptr(), &mut mode_count, modes.as_mut_ptr(), None).is_err() {
            return names;
        }
        for path in &paths[..path_count as usize] {
            let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
            source.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
            source.header.adapterId = path.sourceInfo.adapterId;
            source.header.id = path.sourceInfo.id;
            let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
            target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
            target.header.size = std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32;
            target.header.adapterId = path.targetInfo.adapterId;
            target.header.id = path.targetInfo.id;
            if DisplayConfigGetDeviceInfo(&mut source.header) != 0 || DisplayConfigGetDeviceInfo(&mut target.header) != 0 {
                continue;
            }
            let name = text(&target.monitorFriendlyDeviceName);
            if !name.is_empty() {
                names.push((text(&source.viewGdiDeviceName), name));
            }
        }
    }
    names
}

#[cfg(not(windows))]
fn monitor_names() -> Vec<(String, String)> {
    Vec::new()
}
