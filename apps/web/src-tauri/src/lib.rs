mod discovery;
mod ngrok;
mod printer;
mod server_launch;

use server_launch::ServerProcess;
use std::sync::Mutex;
use tauri::RunEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .manage(ServerProcess(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Error)
            .build(),
        )?;
      }
      if let Err(e) = server_launch::start_if_bundled(app.handle()) {
        eprintln!("[dreamnet] embedded server: {e}");
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      discovery::discover_pos_servers_udp,
      ngrok::ngrok_set_authtoken,
      ngrok::ngrok_start_tunnel,
      ngrok::ngrok_status,
      ngrok::ngrok_stop_tunnel,
      printer::list_local_printers,
      printer::list_lan_printers,
      printer::print_receipt_text
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if matches!(event, RunEvent::Exit) {
      server_launch::kill_server(app_handle);
    }
  });
}
