mod browse;
mod export_stream;
mod files;
mod playlist_archive;
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
                .with_denylist(&["splash"])
                .build(),
        )
        .setup(|app| {
            end_splash_after_time_limit(app.handle().clone());
            playlist_archive::clean_at_start();
            Ok(())
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
            playlist_archive::save_playlist,
            playlist_archive::open_playlist,
            playlist_archive::read_playlist_summary,
            playlist_archive::playlist_scene_path,
            files::reveal_file,
            files::cursor_position,
            screen::screen_color_at_cursor,
            song_analysis::analyze_song,
            sound_capture::sound_devices,
            sound_capture::sound_start,
            sound_capture::sound_stop,
            files::log_frontend_error,
            updater::check_for_update,
            updater::download_and_run_installer,
            updater::get_app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kaleido Sage");
}
