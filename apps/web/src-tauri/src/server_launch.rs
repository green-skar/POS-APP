use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Url};

pub struct ServerProcess(pub Mutex<Option<std::process::Child>>);
use serde::Deserialize;
const EMBEDDED_BOOTSTRAP_PUBLIC_KEY_PEM: &str = include_str!("../pos-app/bootstrap_public_key.pem");

#[derive(Deserialize)]
struct RuntimeInfo {
  port: u16,
}

pub fn start_if_bundled(app: &AppHandle) -> Result<(), String> {
  // In `tauri dev`, the webview should use devUrl; do not boot embedded runtime.
  if cfg!(debug_assertions) {
    return Ok(());
  }

  #[cfg(not(target_os = "windows"))]
  {
    let _ = app;
    return Ok(());
  }

  #[cfg(target_os = "windows")]
  {
    start_if_bundled_windows(app)
  }
}

#[cfg(target_os = "windows")]
fn start_if_bundled_windows(app: &AppHandle) -> Result<(), String> {
  fn append_log_line(log_path: &std::path::Path, line: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(log_path)
    {
      let _ = std::io::Write::write_all(&mut f, line.as_bytes());
      let _ = std::io::Write::write_all(&mut f, b"\n");
    }
  }

  fn cleanup_stale_server_process(pid_path: &std::path::Path) {
    let Ok(text) = std::fs::read_to_string(pid_path) else {
      return;
    };
    let Ok(pid) = text.trim().parse::<u32>() else {
      let _ = std::fs::remove_file(pid_path);
      return;
    };
    let _ = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/T", "/F"])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
    let _ = std::fs::remove_file(pid_path);
  }

  let res = app.path().resource_dir().map_err(|e| e.to_string())?;
  let pos_root = res.join("pos-app");
  let server_js = pos_root.join("build").join("server").join("index.js");
  if !server_js.is_file() {
    return Ok(());
  }

  let node_exe = res.join("vendor").join("node-win").join("node.exe");
  if !node_exe.is_file() {
    return Err(format!(
      "Bundled server found but portable Node is missing at {}",
      node_exe.display()
    ));
  }

  // Per-user data + config.json — same directory the NSIS post-install hook creates under
  // %APPDATA%\<tauri identifier>\data (see installer-hooks.nsh + tauri.conf.json "identifier").
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?
    .join("data");
  std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
  let runtime_path = data_dir.join("runtime.json");
  let _ = std::fs::remove_file(&runtime_path);
  let pid_path = data_dir.join("embedded-server.pid");
  let log_path = data_dir.join("embedded-server.log");
  append_log_line(&log_path, "==============================");
  append_log_line(&log_path, "[launcher] starting embedded server...");
  cleanup_stale_server_process(&pid_path);
  let config_path = data_dir.join("config.json");

  let mut cmd = Command::new(&node_exe);
  cmd.current_dir(&pos_root);
  cmd.arg("build/server/index.js");
  cmd.env("NODE_ENV", "production");
  // PORT is chosen by the embedded Node server: reuse http_port.json when free, else pick another.
  // Force the verifier key from the app binary (not user-configurable).
  cmd.env("BOOTSTRAP_PUBLIC_KEY_PEM", EMBEDDED_BOOTSTRAP_PUBLIC_KEY_PEM.trim());
  cmd.env(
    "DREAMNET_DATA_DIR",
    data_dir
      .to_str()
      .ok_or_else(|| "invalid characters in app data path".to_string())?,
  );
  if config_path.is_file() {
    if let Ok(text) = std::fs::read_to_string(&config_path) {
      if let Ok(map) = serde_json::from_str::<std::collections::BTreeMap<String, String>>(&text) {
        for (k, v) in map {
          if !k.is_empty() {
            cmd.env(k, v);
          }
        }
      }
    }
  }
  // Written by NSIS to $INSTDIR\installer_mode.txt (client | server).
  if let Some(install_root) = res.parent() {
    let installer_mode_path = install_root.join("installer_mode.txt");
    if let Ok(text) = std::fs::read_to_string(&installer_mode_path) {
      let mode = text.trim();
      if !mode.is_empty() {
        cmd.env("DREAMNET_INSTALLER_MODE", mode);
      }
    }
  }
  cmd.stdin(Stdio::null());
  match std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&log_path)
  {
    Ok(stdout_log) => {
      let stderr_log = stdout_log.try_clone().map_err(|e| e.to_string())?;
      cmd.stdout(Stdio::from(stdout_log));
      cmd.stderr(Stdio::from(stderr_log));
      append_log_line(&log_path, "[launcher] piping embedded stdout/stderr to embedded-server.log");
    }
    Err(e) => {
      append_log_line(
        &log_path,
        &format!("[launcher] failed to open log file for piping: {e}"),
      );
      cmd.stdout(Stdio::null());
      cmd.stderr(Stdio::null());
    }
  }
  append_log_line(
    &log_path,
    &format!(
      "[launcher] command={} cwd={} data_dir={}",
      node_exe.display(),
      pos_root.display(),
      data_dir.display()
    ),
  );

  let mut child = cmd.spawn().map_err(|e| format!("failed to start embedded server: {e}"))?;
  append_log_line(&log_path, &format!("[launcher] spawned pid={}", child.id()));
  let _ = std::fs::write(&pid_path, child.id().to_string());

  let deadline = Instant::now() + Duration::from_secs(90);
  let mut port: Option<u16> = None;
  while Instant::now() < deadline {
    if let Ok(text) = std::fs::read_to_string(&runtime_path) {
      if let Ok(info) = serde_json::from_str::<RuntimeInfo>(&text) {
        port = Some(info.port);
        append_log_line(&log_path, &format!("[launcher] runtime.json reported port={}", info.port));
        break;
      }
    }
    thread::sleep(Duration::from_millis(200));
  }

  let Some(port) = port else {
    let _ = child.kill();
    let _ = std::fs::remove_file(&pid_path);
    append_log_line(
      &log_path,
      "[launcher] timeout waiting for runtime.json (90s), child killed",
    );
    return Err(
      format!(
        "Embedded server did not report its port (runtime.json) within 90s. Check {}",
        log_path.display()
      ),
    );
  };

  let url = format!("http://127.0.0.1:{port}/");
  let deadline = Instant::now() + Duration::from_secs(30);
  while Instant::now() < deadline {
    if ureq::get(&url).call().is_ok() {
      append_log_line(&log_path, "[launcher] healthcheck passed");
      break;
    }
    thread::sleep(Duration::from_millis(200));
  }

  app
    .state::<ServerProcess>()
    .0
    .lock()
    .map_err(|_| "server mutex poisoned".to_string())?
    .replace(child);

  let win = app
    .get_webview_window("main")
    .ok_or_else(|| "main window not found".to_string())?;
  let url = format!("http://localhost:{port}/");
  win
    .navigate(Url::parse(&url).map_err(|e| e.to_string())?)
    .map_err(|e| e.to_string())?;
  append_log_line(&log_path, &format!("[launcher] navigated webview to {url}"));

  Ok(())
}

pub fn kill_server(app: &AppHandle) {
  if let Some(state) = app.try_state::<ServerProcess>() {
    let proc: &ServerProcess = state.inner();
    if let Ok(mut g) = proc.0.lock() {
      if let Some(mut c) = g.take() {
        let _ = c.kill();
      }
    }
  }
  if let Ok(data_dir) = app.path().app_data_dir() {
    let _ = std::fs::remove_file(data_dir.join("data").join("embedded-server.pid"));
  }
}
