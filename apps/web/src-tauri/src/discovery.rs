use serde::Deserialize;
use serde::Serialize;
use std::collections::HashSet;
use std::io::ErrorKind;
use std::net::UdpSocket;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UdpBeaconResponse {
    service: String,
    http_port: u16,
    http_origin: String,
    hostname: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct LanDiscoveryRow {
    pub http_origin: String,
    pub hostname: Option<String>,
    pub http_port: Option<u16>,
}

/// Broadcast UDP probe; Node `lan-udp-beacon` responds with JSON (port 48123).
#[tauri::command]
pub fn discover_pos_servers_udp() -> Result<Vec<LanDiscoveryRow>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(Duration::from_millis(400)))
        .map_err(|e| e.to_string())?;
    socket.set_broadcast(true).map_err(|e| e.to_string())?;

    let probe = b"POS_DISCOVERY_PROBE_V1";
    let broadcast: std::net::SocketAddr = "255.255.255.255:48123"
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;
    socket.send_to(probe, broadcast).map_err(|e| e.to_string())?;

    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<LanDiscoveryRow> = Vec::new();
    let deadline = Instant::now() + Duration::from_millis(2600);

    let mut buf = [0u8; 2048];
    while Instant::now() < deadline {
        match socket.recv_from(&mut buf) {
            Ok((n, _)) => {
                let s = String::from_utf8_lossy(&buf[..n]);
                if let Ok(v) = serde_json::from_str::<UdpBeaconResponse>(&s) {
                    if v.service == "pos-api" {
                        let origin = v.http_origin.trim_end_matches('/').to_string();
                        if seen.insert(origin.clone()) {
                            out.push(LanDiscoveryRow {
                                http_origin: origin,
                                hostname: v.hostname,
                                http_port: Some(v.http_port),
                            });
                        }
                    }
                }
            }
            Err(e) => {
                if e.kind() == ErrorKind::WouldBlock || e.kind() == ErrorKind::TimedOut {
                    continue;
                }
                // Other errors: keep listening until deadline
                if Instant::now() >= deadline {
                    break;
                }
            }
        }
    }

    Ok(out)
}
