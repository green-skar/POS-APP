/**
 * Downloads Windows x64 portable Node (LTS) into src-tauri/vendor/node-win for Tauri bundles.
 * Safe to run multiple times; skips if node.exe already exists.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const WEB_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

if (process.platform !== 'win32') {
  console.log('[ensure-node] Skipping portable Node download on', process.platform);
  process.exit(0);
}

/** Keep in sync with `bundle-pos-runtime` / installer; bumping this re-downloads if on-disk Node differs. */
const NODE_VERSION = 'v20.19.0';
const ZIP_NAME = `node-${NODE_VERSION}-win-x64.zip`;
const VENDOR_DIR = join(WEB_ROOT, 'src-tauri', 'vendor');
const DEST = join(VENDOR_DIR, 'node-win');
const ZIP_PATH = join(VENDOR_DIR, ZIP_NAME);
const DOWNLOAD_URL = `https://nodejs.org/dist/${NODE_VERSION}/${ZIP_NAME}`;

const bundledNodeExe = join(DEST, 'node.exe');
if (existsSync(bundledNodeExe)) {
  const reported = execFileSync(bundledNodeExe, ['-v'], { encoding: 'utf8' }).trim();
  if (reported === NODE_VERSION) {
    console.log('[ensure-node] Using existing', bundledNodeExe);
    process.exit(0);
  }
  console.log('[ensure-node] Found', reported, 'but project pins', NODE_VERSION, '— replacing portable Node...');
  rmSync(DEST, { recursive: true, force: true });
}

mkdirSync(VENDOR_DIR, { recursive: true });

console.log('[ensure-node] Downloading', DOWNLOAD_URL);
const res = await fetch(DOWNLOAD_URL);
if (!res.ok) {
  throw new Error(`[ensure-node] Download failed: HTTP ${res.status}`);
}
writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()));

const extractDir = join(VENDOR_DIR, '_node_extract');
rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${ZIP_PATH.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
  ],
  { stdio: 'inherit' }
);

const inner = join(extractDir, `node-${NODE_VERSION}-win-x64`);
if (!existsSync(join(inner, 'node.exe'))) {
  throw new Error(`[ensure-node] Expected ${inner}/node.exe after extract`);
}

rmSync(DEST, { recursive: true, force: true });
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Move-Item -LiteralPath '${inner.replace(/'/g, "''")}' -Destination '${DEST.replace(/'/g, "''")}' -Force`,
  ],
  { stdio: 'inherit' }
);

rmSync(ZIP_PATH, { force: true });
rmSync(extractDir, { recursive: true, force: true });

console.log('[ensure-node] Installed portable Node to', DEST);
