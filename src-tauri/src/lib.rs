mod browse;
mod files;
mod screen;
mod updater;

use tauri::Manager;

fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Full screen is not restored: the app always starts in a window.
    let window_state_flags = tauri_plugin_window_state::StateFlags::SIZE
        | tauri_plugin_window_state::StateFlags::POSITION
        | tauri_plugin_window_state::StateFlags::MAXIMIZED;

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags)
                .build(),
        )
        .setup(|app| {
            restore_main_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            browse::list_browse_directory,
            browse::browse_places,
            browse::rename_browse_entry,
            browse::delete_browse_entry,
            browse::copy_browse_entry,
            files::read_image_file,
            files::save_snapshot,
            files::save_scene,
            files::read_scene,
            files::reveal_file,
            files::cursor_position,
            screen::screen_color_at_cursor,
            files::log_frontend_error,
            updater::check_for_update,
            updater::download_and_run_installer,
            updater::get_app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kaleido Sage");
}
