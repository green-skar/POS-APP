use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct PrinterInfo {
  pub name: String,
  pub is_network: bool,
  pub is_local: bool,
}

fn run_powershell(script: &str) -> Result<String, String> {
  let output = Command::new("powershell")
    .args(["-NoProfile", "-NonInteractive", "-Command", script])
    .output()
    .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(if stderr.is_empty() {
      "PowerShell command failed".to_string()
    } else {
      stderr
    });
  }

  Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_printers_json(raw: &str) -> Vec<PrinterInfo> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return vec![];
  }
  let parsed: serde_json::Value = match serde_json::from_str(trimmed) {
    Ok(v) => v,
    Err(_) => return vec![],
  };
  let rows: Vec<serde_json::Value> = match parsed {
    serde_json::Value::Array(a) => a,
    other => vec![other],
  };
  rows
    .into_iter()
    .filter_map(|row| {
      let name = row.get("Name")?.as_str()?.trim().to_string();
      if name.is_empty() {
        return None;
      }
      let is_network = row
        .get("Network")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
      let is_local = row.get("Local").and_then(|v| v.as_bool()).unwrap_or(!is_network);
      Some(PrinterInfo {
        name,
        is_network,
        is_local,
      })
    })
    .collect()
}

#[tauri::command]
pub fn list_local_printers() -> Result<Vec<PrinterInfo>, String> {
  #[cfg(not(target_os = "windows"))]
  {
    return Ok(vec![]);
  }

  #[cfg(target_os = "windows")]
  {
    let script = r#"
$rows = Get-CimInstance Win32_Printer | Where-Object { $_.Local -eq $true } | Select-Object Name,Network,Local
$rows | ConvertTo-Json -Compress
"#;
    let out = run_powershell(script)?;
    Ok(parse_printers_json(&out))
  }
}

#[tauri::command]
pub fn list_lan_printers() -> Result<Vec<PrinterInfo>, String> {
  #[cfg(not(target_os = "windows"))]
  {
    return Ok(vec![]);
  }

  #[cfg(target_os = "windows")]
  {
    let script = r#"
$rows = Get-CimInstance Win32_Printer | Where-Object { $_.Network -eq $true } | Select-Object Name,Network,Local
$rows | ConvertTo-Json -Compress
"#;
    let out = run_powershell(script)?;
    Ok(parse_printers_json(&out))
  }
}

#[tauri::command]
pub fn print_receipt_text(printer_name: String, receipt_text: String) -> Result<(), String> {
  #[cfg(not(target_os = "windows"))]
  {
    let _ = printer_name;
    let _ = receipt_text;
    return Err("Printing is currently supported on Windows builds only.".to_string());
  }

  #[cfg(target_os = "windows")]
  {
    let p = printer_name.replace('\'', "''");
    let t = receipt_text.replace('\'', "''");
    let script = format!("$txt = @'\n{t}\n'@; $txt | Out-Printer -Name '{p}'");
    run_powershell(&script)?;
    Ok(())
  }
}

