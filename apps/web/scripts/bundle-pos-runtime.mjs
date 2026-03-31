/**
 * After `react-router build`, writes a minimal fallback index.html for Tauri shell
 * and copies full `build/` into `src-tauri/pos-app/build` for the embedded Node server.
 */
import { cp, mkdir, mkdtemp, rename, rm, writeFile, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';

const WEB_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BUILD_DIR = join(WEB_ROOT, 'build');
const TAURI_FALLBACK_DIR = join(WEB_ROOT, 'src-tauri', 'tauri-fallback');
const POS_APP = join(WEB_ROOT, 'src-tauri', 'pos-app');
const DEST_BUILD = join(POS_APP, 'build');
const SRC_NODE_MODULES = join(WEB_ROOT, 'node_modules');
const DEST_NODE_MODULES = join(POS_APP, 'node_modules');
const BOOTSTRAP_PUB_SRC = join(WEB_ROOT, 'scripts', 'keys', 'bootstrap_ed25519_public.pem');
const BOOTSTRAP_PUB_DEST = join(POS_APP, 'bootstrap_public_key.pem');
const BUNDLED_NODE_DIR = join(WEB_ROOT, 'src-tauri', 'vendor', 'node-win');
const WEB_PACKAGE_JSON = join(WEB_ROOT, 'package.json');
const WEB_PACKAGE_LOCK = join(WEB_ROOT, 'package-lock.json');
const CLIENT_INDEX = join(BUILD_DIR, 'client', 'index.html');
const DEST_CLIENT_INDEX = join(DEST_BUILD, 'client', 'index.html');

execFileSync(process.execPath, [join(WEB_ROOT, 'scripts', 'ensure-node-portable.mjs')], { stdio: 'inherit' });

async function deleteIfStaleFallbackIndex(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const text = await readFile(filePath, 'utf8');
  if (
    text.includes('<p>Starting application server') ||
    text.includes('Starting application server…') ||
    text.includes('Starting application server...')
  ) {
    await unlink(filePath);
    console.warn('[bundle-pos-runtime] Removed stale fallback index at', filePath);
  }
}

/**
 * Install production dependencies with the same Node.exe we ship (20.x ABI), so native addons
 * (better-sqlite3, argon2, …) match the embedded runtime. Uses a temp dir so pos-app/package.json
 * in the repo stays the small `{ "type": "module" }` stub.
 */
async function installProductionDepsForBundledNode() {
  const npmCmd = join(BUNDLED_NODE_DIR, 'npm.cmd');
  if (!existsSync(npmCmd)) {
    throw new Error(`[bundle-pos-runtime] Missing ${npmCmd} — run ensure-node-portable first.`);
  }
  if (!existsSync(WEB_PACKAGE_LOCK)) {
    throw new Error('[bundle-pos-runtime] Missing package-lock.json — run `npm install` in apps/web.');
  }
  const stage = await mkdtemp(join(tmpdir(), 'dreamnet-pos-'));

  try {
    const pkg = JSON.parse(await readFile(WEB_PACKAGE_JSON, 'utf8'));
    pkg.type = 'module';
    await writeFile(join(stage, 'package.json'), `${JSON.stringify(pkg, null, '\t')}\n`, 'utf8');
    await cp(WEB_PACKAGE_LOCK, join(stage, 'package-lock.json'));
    console.log('[bundle-pos-runtime] npm ci --omit=dev (bundled Node; native modules match installer)...');
    execSync(`"${npmCmd}" ci --omit=dev --no-audit --no-fund`, {
      cwd: stage,
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: `${BUNDLED_NODE_DIR};${process.env.PATH ?? ''}`,
      },
      shell: true,
    });
    await rm(DEST_NODE_MODULES, { recursive: true, force: true });
    const stagedModules = join(stage, 'node_modules');
    try {
      await rename(stagedModules, DEST_NODE_MODULES);
    } catch (err) {
      if (err?.code !== 'EXDEV') throw err;
      await cp(stagedModules, DEST_NODE_MODULES, { recursive: true });
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (!existsSync(join(BUILD_DIR, 'server', 'index.js'))) {
  throw new Error('[bundle-pos-runtime] Missing build/server/index.js — run `npm run build` first.');
}

const stub = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dreamnet Media Tech</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
  </style>
</head>
<body>
  <p>Starting application server…</p>
</body>
</html>
`;

await mkdir(TAURI_FALLBACK_DIR, { recursive: true });
await writeFile(join(TAURI_FALLBACK_DIR, 'index.html'), stub, 'utf8');
// If an old bundling run wrote the fallback into build/client/index.html, remove it.
await deleteIfStaleFallbackIndex(CLIENT_INDEX);

await mkdir(POS_APP, { recursive: true });
await rm(DEST_BUILD, { recursive: true, force: true });
await cp(BUILD_DIR, DEST_BUILD, { recursive: true });
// Defense-in-depth in case stale files were copied from build/client.
await deleteIfStaleFallbackIndex(DEST_CLIENT_INDEX);
// Bundle Node runtime dependencies for the embedded server.
if (process.platform === 'win32' && existsSync(join(BUNDLED_NODE_DIR, 'npm.cmd'))) {
  await installProductionDepsForBundledNode();
} else {
  console.warn(
    '[bundle-pos-runtime] Copying apps/web node_modules (non-Windows or missing bundled npm). ' +
      'Windows installers should be built on win32 so native addons match vendor/node-win.'
  );
  if (!existsSync(SRC_NODE_MODULES)) {
    throw new Error('[bundle-pos-runtime] Missing node_modules — run `npm install` first.');
  }
  await rm(DEST_NODE_MODULES, { recursive: true, force: true });
  await cp(SRC_NODE_MODULES, DEST_NODE_MODULES, { recursive: true });
}
if (existsSync(BOOTSTRAP_PUB_SRC)) {
  await writeFile(BOOTSTRAP_PUB_DEST, await readFile(BOOTSTRAP_PUB_SRC, 'utf8'), 'utf8');
}

console.log('[bundle-pos-runtime] Copied build to', DEST_BUILD);
