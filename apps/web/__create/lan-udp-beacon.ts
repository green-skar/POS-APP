/**
 * LAN UDP discovery beacon: replies to POS_DISCOVERY_PROBE_V1 so Tauri/desktop clients
 * can find this machine's HTTP origin without scanning the whole subnet.
 * Port must match apps/web/src/utils/lanDiscovery.js POS_LAN_UDP_PORT.
 */
import dgram from 'node:dgram';
import os from 'node:os';

export const POS_LAN_UDP_PORT = 48123;
const PROBE = 'POS_DISCOVERY_PROBE_V1';

let beaconSocket: dgram.Socket | null = null;

function getPrimaryLANIPv4(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

export function startLanUdpBeacon(httpPort: number): void {
  if (beaconSocket) {
    return;
  }
  const s = dgram.createSocket('udp4');
  s.on('message', (msg, rinfo) => {
    const text = msg.toString('utf8').trim();
    if (text !== PROBE) {
      return;
    }
    const lanIp = getPrimaryLANIPv4();
    const payload = JSON.stringify({
      service: 'pos-api',
      version: 1,
      httpPort,
      httpOrigin: `http://${lanIp}:${httpPort}`,
      hostname: os.hostname(),
    });
    s.send(Buffer.from(payload, 'utf8'), rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error('[lan-udp-beacon] send failed:', err.message);
      }
    });
  });
  s.on('error', (err) => {
    console.error('[lan-udp-beacon]', err.message);
  });
  s.bind(POS_LAN_UDP_PORT, '0.0.0.0', () => {
    try {
      s.setBroadcast(true);
    } catch {
      /* ignore */
    }
    console.log(`[lan-udp-beacon] listening on udp/0.0.0.0:${POS_LAN_UDP_PORT} (HTTP port ${httpPort})`);
  });
  beaconSocket = s;
}

export function stopLanUdpBeacon(): void {
  if (beaconSocket) {
    beaconSocket.close();
    beaconSocket = null;
  }
}
