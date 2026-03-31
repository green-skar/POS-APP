Embedded React Router + Hono server (production)
================================================

Populated by: npm run build && node scripts/bundle-pos-runtime.mjs
(which runs before tauri build via apps/web/src-tauri/tauri.conf.json beforeBuildCommand).

Portable Node + native modules
------------------------------
Windows bundles ship vendor/node-win (see scripts/ensure-node-portable.mjs). Production
dependencies are installed with THAT Node (npm ci --omit=dev) so .node addons match the
embedded runtime (e.g. better-sqlite3). Do not copy apps/web node_modules from a different
Node major without rebuilding.

Windows installer ↔ runtime paths
---------------------------------
- NSIS: apps/web/src-tauri/installer-hooks.nsh + nsis/installer.nsi
- App identifier (bundle id) lives in tauri.conf.json "identifier". The installer writes
  config.json under %APPDATA%\<identifier>\data using ${BUNDLEID} — same folder as
  Tauri app_data_dir() + "\data" in src/server_launch.rs.
- installer_mode.txt is written to the install directory ($INSTDIR). Rust reads it and sets
  DREAMNET_INSTALLER_MODE for the Node process (see server_launch.rs).
- HKCU Software\DreamnetMediaTech\InstallerMode mirrors the mode for optional external use.

Version alignment
-----------------
Keep in sync where users see a single version:
  apps/web/src-tauri/tauri.conf.json "version"
  apps/web/src-tauri/Cargo.toml version
