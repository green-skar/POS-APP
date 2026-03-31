import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Set by Tauri on Windows to a writable per-user data directory (contains pos_database.db). */
export function resolveDreamnetDataDir(): string {
  const explicit = process.env.DREAMNET_DATA_DIR?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..');
}

export function resolvePosDatabasePath(): string {
  return path.join(resolveDreamnetDataDir(), 'pos_database.db');
}
