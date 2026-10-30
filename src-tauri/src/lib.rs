mod browse;
mod cast;
mod export_stream;
mod files;
mod file_archive;
mod output_choice;
mod sound_capture;
mod screen;
pub mod song_analysis;
pub mod song_sections;
mod updater;
mod video_import;
mod video_stream;
mod scene_archive;

use std::time::Duration;
use tauri::Manager;

/// How long the splash window may stay up before the main window is shown anyway.
const SPLASH_TIME_LIMIT: Duration = Duration::from_secs(15);

fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/**
 * The main window starts hidden behind the splash window, and the page shows
 * it when it is ready (src/lib/splash.ts). If the page fails before that, this
 * shows it and closes the splash after a time limit.
 */
fn end_splash_after_time_limit(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(SPLASH_TIME_LIMIT);
        let hidden = app
            .get_webview_window("main")
            .is_some_and(|main| !main.is_visible().unwrap_or(true));
        if hidden {
            restore_main_window(&app);
        }
        if let Some(splash) = app.get_webview_window("splash") {
            let _ = splash.close();
        }
    });
}

/**
 * The main window, from its entry in tauri.conf.json ("create": false), made
 * here so that it can open the Show window with window.open (see cast.rs).
 */
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
        .expect("tauri.conf.json has the main window");
    let handle = app.clone();
    tauri::WebviewWindowBuilder::from_config(app, &config)?
        .on_new_window(move |url, features| match cast::show_window(&handle, &url, features) {
            Some(window) => tauri::webview::NewWindowResponse::Create { window },
            None => tauri::webview::NewWindowResponse::Deny,
        })
        .build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Full screen is not restored: the app always starts in a window.
    let window_state_flags = tauri_plugin_window_state::StateFlags::SIZE
        | tauri_plugin_window_state::StateFlags::POSITION
        | tauri_plugin_window_state::StateFlags::MAXIMIZED;

    tauri::Builder::default()
        .manage(video_stream::Videos::default())
        .manage(video_stream::Uploads::default())
        .manage(export_stream::Exports::default())
        .manage(sound_capture::SoundCapture::default())
        .manage(cast::CastTarget::default())
        .on_page_load(|webview, payload| sound_capture::stop_on_page_load(webview, payload))
        .register_asynchronous_uri_scheme_protocol("video", |ctx, request, responder| {
            let id = request.uri().path().trim_start_matches('/');
            let source = ctx.app_handle().state::<video_stream::Videos>().get(id);
            tauri::async_runtime::spawn_blocking(move || responder.respond(video_stream::response(request, source)));
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            // The splash window is always centered, so its state is not saved.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags)
                .with_denylist(&["splash", cast::SHOW_LABEL])
                .build(),
        )
        .setup(|app| {
            build_main_window(app.handle())?;
            end_splash_after_time_limit(app.handle().clone());
            file_archive::clean_at_start();
            Ok(())
        })
        .on_window_event(|window, event| {
            /* The Show window (see cast.rs) closes with the main window, so the app can end. */
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(show) = window.app_handle().get_webview_window(cast::SHOW_LABEL) {
                    let _ = show.destroy();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            browse::list_browse_directory,
            browse::browse_places,
            browse::rename_browse_entry,
            browse::delete_browse_entry,
            browse::copy_browse_entry,
            files::read_image_file,
            files::read_audio_file,
            video_stream::open_video_file,
            video_stream::begin_video_upload,
            video_stream::append_video_upload,
            video_stream::finish_video_upload,
            video_import::compatible_video,
            files::save_export,
            export_stream::begin_export,
            export_stream::write_export,
            export_stream::finish_export,
            files::default_export_folder,
            scene_archive::save_scene,
            scene_archive::read_scene,
            file_archive::save_file,
            file_archive::open_file,
            file_archive::read_file_summary,
            file_archive::scene_copy_path,
            file_archive::read_file_scene,
            file_archive::matching_scenes,
            files::reveal_file,
            files::cursor_position,
            screen::screen_color_at_cursor,
            song_analysis::analyze_song,
            sound_capture::sound_devices,
            sound_capture::sound_start,
            sound_capture::sound_stop,
            output_choice::allow_output_choice,
            cast::cast_screens,
            cast::cast_target,
            cast::cast_place,
            cast::cast_close,
            files::log_frontend_error,
            updater::check_for_update,
            updater::download_and_run_installer,
            updater::get_app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kaleido Sage");
}
