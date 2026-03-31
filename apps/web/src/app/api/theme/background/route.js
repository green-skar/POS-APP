import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSession } from '../../../../utils/auth.js';

const ALLOWED_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const MAX_BYTES = 8 * 1024 * 1024;

function resolveThemeBackgroundsDir() {
  const d = process.env.DREAMNET_DATA_DIR?.trim();
  if (d) return path.join(path.resolve(d), 'theme-backgrounds');
  return path.join(process.cwd(), 'public', 'theme-backgrounds');
}

/**
 * POST multipart/form-data with field "file" — saves under writable theme-backgrounds
 * and returns { url: "/api/theme/background-file/<id>.ext" } (served by embedded API in production).
 */
export async function POST(request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => c.trim().split('='))
    );
    const token = cookies.session_token;
    const session = token ? getSession(token) : null;
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const mime = file.type || '';
    if (!ALLOWED_TYPES.has(mime)) {
      return Response.json(
        { error: 'Invalid image type. Use JPEG, PNG, WebP, or GIF.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      return Response.json({ error: 'File too large (max 8MB)' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES.get(mime);
    const filename = `${crypto.randomUUID()}${ext}`;
    const publicDir = resolveThemeBackgroundsDir();
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, filename), buffer);

    const url = `/api/theme/background-file/${filename}`;
    return Response.json({ url });
  } catch (error) {
    console.error('POST /api/theme/background:', error);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
