use serde::Serialize;
use serde_json::Value;
use std::process::{Child, Command, Stdio};
use std::sync::{LazyLock, Mutex};
use std::thread::sleep;
use std::time::Duration;

static NGROK_CHILD: LazyLock<Mutex<Option<Child>>> = LazyLock::new(|| Mutex::new(None));

#[derive(Debug, Serialize)]
pub struct NgrokStatus {
    pub available: bool,
    pub running: bool,
    pub managed_by_app: bool,
    pub public_url: Option<String>,
    pub error: Option<String>,
}

fn ngrok_bin() -> &'static str {
    if cfg!(target_os = "windows") {
        "ngrok.exe"
    } else {
        "ngrok"
    }
}

fn is_ngrok_available() -> bool {
    Command::new(ngrok_bin())
        .arg("version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn pick_public_url(json: &Value) -> Option<String> {
    let tunnels = json.get("tunnels")?.as_array()?;
    let https = tunnels.iter().find(|t| {
        t.get("proto")
            .and_then(|p| p.as_str())
            .map(|p| p.eq_ignore_ascii_case("https"))
            .unwrap_or(false)
    });
    let any = tunnels.first();
    let chosen = https.or(any)?;
    chosen
        .get("public_url")
        .and_then(|u| u.as_str())
        .map(|u| u.trim_end_matches('/').to_string())
}

fn read_public_url_from_api() -> Option<String> {
    let res = ureq::get("http://127.0.0.1:4040/api/tunnels")
        .timeout(Duration::from_millis(800))
        .call();
    let body: Value = match res {
        Ok(resp) => resp.into_json().ok()?,
        Err(_) => return None,
    };
    pick_public_url(&body)
}

fn child_is_running() -> bool {
    let mut guard = match NGROK_CHILD.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    let Some(child) = guard.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(None) => true,
        Ok(Some(_)) | Err(_) => {
            *guard = None;
            false
        }
    }
}

#[tauri::command]
pub fn ngrok_set_authtoken(token: String) -> Result<bool, String> {
    let t = token.trim();
    if t.is_empty() {
        return Err("Auth token is required".to_string());
    }
    let out = Command::new(ngrok_bin())
        .args(["config", "add-authtoken", t])
        .output()
        .map_err(|e| format!("Failed to run ngrok: {e}"))?;
    if out.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        Err(format!(
            "ngrok authtoken failed: {} {}",
            stdout.trim(),
            stderr.trim()
        ))
    }
}

#[tauri::command]
pub fn ngrok_start_tunnel(port: Option<u16>) -> Result<NgrokStatus, String> {
    if !is_ngrok_available() {
        return Err("ngrok is not installed or not in PATH".to_string());
    }
    let p = port.unwrap_or(4000);

    if !child_is_running() {
        let child = Command::new(ngrok_bin())
            .args(["http", &p.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start ngrok: {e}"))?;
        if let Ok(mut guard) = NGROK_CHILD.lock() {
            *guard = Some(child);
        }
    }

    for _ in 0..24 {
        if let Some(url) = read_public_url_from_api() {
            return Ok(NgrokStatus {
                available: true,
                running: true,
                managed_by_app: child_is_running(),
                public_url: Some(url),
                error: None,
            });
        }
        sleep(Duration::from_millis(350));
    }

    Ok(NgrokStatus {
        available: true,
        running: child_is_running(),
        managed_by_app: child_is_running(),
        public_url: None,
        error: Some("ngrok started but public URL was not found".to_string()),
    })
}

#[tauri::command]
pub fn ngrok_status() -> NgrokStatus {
    let available = is_ngrok_available();
    let public_url = read_public_url_from_api();
    let managed = child_is_running();
    NgrokStatus {
        available,
        running: public_url.is_some() || managed,
        managed_by_app: managed,
        public_url,
        error: if available {
            None
        } else {
            Some("ngrok is not installed or not in PATH".to_string())
        },
    }
}

#[tauri::command]
pub fn ngrok_stop_tunnel() -> bool {
    let mut stopped = false;
    if let Ok(mut guard) = NGROK_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            stopped = true;
        }
    }
    stopped
}
