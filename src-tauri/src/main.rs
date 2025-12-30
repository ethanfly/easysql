// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod commands;
mod config;
mod ssh;

use tauri::Manager;
use tracing_subscriber;

fn main() {
    // 初始化日志
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 当尝试打开第二个实例时，聚焦现有窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .setup(|app| {
            // 初始化数据库连接管理器
            database::init();
            
            // 获取主窗口并设置
            if let Some(window) = app.get_webview_window("main") {
                // Windows 上启用窗口阴影效果
                #[cfg(target_os = "windows")]
                {
                    use tauri::WebviewWindow;
                    let _ = window.set_decorations(false);
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 窗口控制
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            // 数据库操作
            commands::db_test,
            commands::db_connect,
            commands::db_disconnect,
            commands::db_query,
            commands::db_get_databases,
            commands::db_get_tables,
            commands::db_get_columns,
            commands::db_get_table_data,
            commands::db_update_row,
            commands::db_delete_row,
            commands::db_backup,
            commands::db_export_table,
            // 配置操作
            commands::config_save,
            commands::config_load,
            commands::config_export,
            commands::config_import,
            // 文件操作
            commands::file_open,
            commands::file_save,
            commands::file_select,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

