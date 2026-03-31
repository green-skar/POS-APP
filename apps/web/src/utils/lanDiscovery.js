/**
 * LAN discovery for POS API servers.
 * - HTTP: scans likely /24 subnets for GET /api/health (works in any browser).
 * - UDP: Tauri sends broadcast probe; Node beacon responds (see __create/lan-udp-beacon.ts).
 *
 * @see apps/web/NETWORK_SETUP.md
 */

export const POS_LAN_UDP_PORT = 48123;

const HEALTH_PATH = "/api/health";

/**
 * HTTP ports to probe on each LAN host when the server may use any port (Tauri UDP still returns the exact origin first).
 * @param {number} [preferredPort] - e.g. from user settings; merged into the set
 * @returns {number[]}
 */
export function buildLanHttpScanPortList(preferredPort) {
  const set = new Set();
  const add = (n) => {
    const x = parseInt(String(n), 10);
    if (Number.isFinite(x) && x > 0 && x < 65536) set.add(x);
  };
  add(preferredPort);
  [4000, 3000, 5173, 8080, 8888, 9000, 5000, 3500].forEach(add);
  for (let p = 3988; p <= 4012; p++) add(p);
  for (let p = 2995; p <= 3005; p++) add(p);
  for (let p = 5170; p <= 5176; p++) add(p);
  for (let p = 8078; p <= 8084; p++) add(p);
  return Array.from(set).sort((a, b) => a - b);
}

/** @param {number} port */
function buildOrigin(host, port) {
  return `http://${host}:${port}`;
}

/**
 * Try to learn local IPv4 via WebRTC (best effort).
 * @returns {Promise<string|null>}
 */
export function getLocalIPv4ViaWebRTC() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.RTCPeerConnection) {
      resolve(null);
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: [] });
    const done = (ip) => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(ip);
    };
    const t = window.setTimeout(() => done(null), 2500);
    try {
      pc.createDataChannel("");
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done(null));
      pc.onicecandidate = (ice) => {
        if (!ice?.candidate?.candidate) return;
        const m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
        if (m && m[1] && !m[1].startsWith("127.")) {
          window.clearTimeout(t);
          done(m[1]);
        }
      };
    } catch {
      window.clearTimeout(t);
      done(null);
    }
  });
}

/**
 * @param {string} ip
 * @returns {string|null} e.g. "192.168.1"
 */
export function subnetPrefix24(ip) {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/**
 * @param {string} prefix "192.168.1"
 * @returns {string[]}
 */
export function enumerateHostsInSubnet(prefix) {
  const out = [];
  for (let i = 1; i <= 254; i++) {
    out.push(`${prefix}.${i}`);
  }
  return out;
}

/**
 * @param {string} origin e.g. http://192.168.1.5:4000
 * @param {AbortSignal} [outerSignal]
 */
async function probeHealth(origin, outerSignal) {
  const url = `${origin.replace(/\/+$/, "")}${HEALTH_PATH}`;
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 450);
  const onAbort = () => ctrl.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      window.clearTimeout(to);
      return null;
    }
    outerSignal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit", signal: ctrl.signal });
    window.clearTimeout(to);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (json && json.ok === true && json.service === "pos-api") {
      const info = await fetchServerInfo(origin, ctrl.signal);
      return { origin: origin.replace(/\/+$/, ""), health: json, info };
    }
    return null;
  } catch {
    window.clearTimeout(to);
    return null;
  } finally {
    if (outerSignal) {
      outerSignal.removeEventListener("abort", onAbort);
    }
  }
}

async function fetchServerInfo(origin, signal) {
  try {
    const r = await fetch(`${origin.replace(/\/+$/, "")}/api/server-info`, {
      method: "GET",
      credentials: "omit",
      signal,
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Parallel HTTP scan for POS servers on LAN.
 * @param {{ httpPort: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} opts
 * @returns {Promise<{ origin: string, health: object }[]>}
 */
export async function discoverViaHttpScan(opts) {
  const { httpPort, httpPorts, onProgress, signal } = opts;
  const preferred = Number(httpPort) || 4000;
  const prefixes = new Set();

  const local = await getLocalIPv4ViaWebRTC();
  const p = local ? subnetPrefix24(local) : null;
  if (p) prefixes.add(p);

  // Common home/office subnets (only when WebRTC failed or to widen search)
  ["192.168.1", "192.168.0", "10.0.0"].forEach((x) => prefixes.add(x));

  const hosts = [];
  for (const prefix of prefixes) {
    hosts.push(...enumerateHostsInSubnet(prefix));
  }

  const ports = Array.from(
    new Set(
      (Array.isArray(httpPorts) ? httpPorts : buildLanHttpScanPortList(preferred))
        .map((x) => parseInt(String(x), 10))
        .filter((x) => Number.isFinite(x) && x > 0 && x < 65536)
    )
  );
  const scanPorts = ports.length ? ports : [4000];
  const targets = [];
  for (const host of hosts) {
    for (const pnum of scanPorts) {
      targets.push(buildOrigin(host, pnum));
    }
  }

  const total = targets.length;
  let done = 0;
  const concurrency = 32;
  const found = [];

  const queue = [...targets];

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) {
        return;
      }
      const origin = queue.shift();
      if (!origin) return;
      const hit = await probeHealth(origin, signal);
      done += 1;
      onProgress?.(done, total);
      if (hit) {
        found.push(hit);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);

  // Dedupe by origin
  const seen = new Set();
  return found.filter((x) => {
    if (seen.has(x.origin)) return false;
    seen.add(x.origin);
    return true;
  });
}

/**
 * @returns {Promise<boolean>}
 */
async function isTauri() {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/**
 * Tauri: UDP broadcast discovery (see src-tauri discover_pos_servers_udp).
 * @returns {Promise<{ origin: string, hostname?: string, via: string }[]>}
 */
export async function discoverViaTauriUdp() {
  if (!(await isTauri())) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const rows = await invoke("discover_pos_servers_udp");
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      origin: String(r.http_origin || r.httpOrigin || "").replace(/\/+$/, ""),
      hostname: r.hostname,
      via: "udp",
    })).filter((x) => x.origin.startsWith("http"));
  } catch (e) {
    console.warn("[lanDiscovery] Tauri UDP discovery failed:", e);
    return [];
  }
}

/**
 * Full discovery: UDP (Tauri) + HTTP scan, merged and health-verified for UDP entries.
 * @param {{ httpPort?: number, onProgress?: (phase: string, done: number, total: number) => void, signal?: AbortSignal }} opts
 */
export async function discoverPosServers(opts = {}) {
  const httpPort = Number(opts.httpPort) || 4000;
  const httpPorts = Array.isArray(opts.httpPorts) ? opts.httpPorts : undefined;
  const signal = opts.signal;
  const outMap = new Map();

  const udp = await discoverViaTauriUdp();
  for (const u of udp) {
    if (signal?.aborted) break;
    const v = await probeHealth(u.origin, signal);
    if (v) {
      outMap.set(v.origin, { ...v, via: "udp", hostname: u.hostname });
    }
  }

  if (signal?.aborted) return [...outMap.values()];

  opts.onProgress?.("http", 0, 1);
  const httpHits = await discoverViaHttpScan({
    httpPort,
    httpPorts,
    signal,
    onProgress: (d, t) => opts.onProgress?.("http", d, t),
  });

  for (const h of httpHits) {
    if (!outMap.has(h.origin)) {
      outMap.set(h.origin, { ...h, via: "http" });
    }
  }

  return [...outMap.values()];
}
