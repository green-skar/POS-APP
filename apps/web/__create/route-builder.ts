import { Hono, type Context } from 'hono';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';

// Import database directly
import Database from 'better-sqlite3';
import path from 'path';
import { hash, verify } from 'argon2';
import crypto from 'crypto';
import { resolvePosDatabasePath } from '../lib/paths.ts';
import { applyDatabaseSchema } from '../lib/sqlite-schema.ts';
import {
  formatPhoneNumber,
  initiateSTKPush,
  validateCallback,
  parseCallback,
  setMpesaEnvResolver,
} from '../src/app/api/utils/daraja.js';

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbPath = resolvePosDatabasePath();
  const db = new Database(dbPath);
  // Enable foreign keys once on the shared connection.
  db.pragma('foreign_keys = ON');
  applyDatabaseSchema(db);
  dbInstance = db;
  return db;
}

const db = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const realDb = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(realDb, prop, receiver);
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(realDb);
    }
    return value;
  },
});

/** Writable theme uploads: app data dir when set, else dev public folder. */
function resolveThemeBackgroundsDir(): string {
  const d = process.env.DREAMNET_DATA_DIR?.trim();
  if (d) return path.join(path.resolve(d), 'theme-backgrounds');
  return path.join(process.cwd(), 'public', 'theme-backgrounds');
}

/** --- Inventory lots (FIFO COGS) --- */
function seedLotsIfMissing(productId: number) {
  const row = db
    .prepare(`SELECT COALESCE(SUM(quantity_remaining), 0) as s FROM inventory_lots WHERE product_id = ?`)
    .get(productId) as { s: number };
  if ((row?.s || 0) > 0) return;
  const p = db
    .prepare(`SELECT stock_quantity, COALESCE(cost_price, 0) as c FROM products WHERE id = ?`)
    .get(productId) as { stock_quantity: number; c: number } | undefined;
  if (!p || !p.stock_quantity || p.stock_quantity <= 0) return;
  db.prepare(`INSERT INTO inventory_lots (product_id, quantity_remaining, unit_cost) VALUES (?, ?, ?)`).run(
    productId,
    p.stock_quantity,
    p.c ?? 0
  );
}

function addInventoryLot(productId: number, qty: number, unitCost: number) {
  if (qty <= 0) return;
  db.prepare(`INSERT INTO inventory_lots (product_id, quantity_remaining, unit_cost) VALUES (?, ?, ?)`).run(
    productId,
    qty,
    Math.max(0, Number(unitCost) || 0)
  );
}

function shrinkInventoryLotsFifo(productId: number, qty: number) {
  let remaining = qty;
  while (remaining > 0) {
    const row = db
      .prepare(
        `SELECT id, quantity_remaining FROM inventory_lots WHERE product_id = ? AND quantity_remaining > 0 ORDER BY id ASC LIMIT 1`
      )
      .get(productId) as { id: number; quantity_remaining: number } | undefined;
    if (!row) break;
    const take = Math.min(remaining, row.quantity_remaining);
    const newQ = row.quantity_remaining - take;
    db.prepare(`UPDATE inventory_lots SET quantity_remaining = ? WHERE id = ?`).run(newQ, row.id);
    remaining -= take;
  }
}

function consumeFifoCogs(productId: number, qty: number): number {
  seedLotsIfMissing(productId);
  let remaining = qty;
  let total = 0;
  while (remaining > 0) {
    const row = db
      .prepare(
        `SELECT id, quantity_remaining, unit_cost FROM inventory_lots WHERE product_id = ? AND quantity_remaining > 0 ORDER BY id ASC LIMIT 1`
      )
      .get(productId) as { id: number; quantity_remaining: number; unit_cost: number } | undefined;
    if (!row) break;
    const take = Math.min(remaining, row.quantity_remaining);
    total += take * (Number(row.unit_cost) || 0);
    const newQ = row.quantity_remaining - take;
    db.prepare(`UPDATE inventory_lots SET quantity_remaining = ? WHERE id = ?`).run(newQ, row.id);
    remaining -= take;
  }
  if (remaining > 0) {
    const p = db.prepare(`SELECT COALESCE(cost_price, 0) as c FROM products WHERE id = ?`).get(productId) as { c: number };
    total += remaining * (p?.c || 0);
  }
  return total;
}

function normalizePermissionsForDb(permissions: unknown): string | null {
  if (permissions == null) return null;
  if (Array.isArray(permissions)) return JSON.stringify(permissions);
  if (typeof permissions === 'string') {
    try {
      const p = JSON.parse(permissions);
      return Array.isArray(p) ? JSON.stringify(p) : permissions;
    } catch {
      return permissions;
    }
  }
  return null;
}

function ensureAppSettingsTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.error('ensureAppSettingsTable:', e);
  }
}

function ensureNetworkWorkstationsTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS network_workstations (
        workstation_id TEXT PRIMARY KEY NOT NULL,
        workstation_name TEXT,
        hostname TEXT,
        role TEXT,
        last_ip TEXT,
        last_url TEXT,
        mac_address TEXT,
        suspended INTEGER DEFAULT 0,
        suspend_reason TEXT,
        first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.error('ensureNetworkWorkstationsTable:', e);
  }
}

type PaymentConfigFile = {
  mpesa?: Record<string, string>;
  card?: Record<string, string>;
  ngrok?: {
    autoStartTunnel?: boolean;
    autoApplyCallback?: boolean;
    tunnelPort?: number;
  };
  currency?: {
    code?: string;
    locale?: string;
  };
  timezone?: {
    mode?: 'auto' | 'manual';
    value?: string;
  };
  dateTimeLocale?: string;
};

function getPaymentConfigFromDb(): PaymentConfigFile {
  try {
    ensureAppSettingsTable();
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('payment_config') as { value: string } | undefined;
    if (!row?.value) return {};
    return JSON.parse(row.value) as PaymentConfigFile;
  } catch {
    return {};
  }
}

function mergeMpesaEnvForDaraja(): Record<string, string | undefined> {
  const cfg = getPaymentConfigFromDb();
  const m = cfg.mpesa || {};
  const pick = (dbKey: string, envKey: string) => {
    const v = m[dbKey];
    if (v != null && String(v).trim() !== '') return String(v).trim();
    return process.env[envKey];
  };
  return {
    MPESA_ENV: (pick('env', 'MPESA_ENV') as string) || process.env.MPESA_ENV,
    MPESA_CONSUMER_KEY: pick('consumerKey', 'MPESA_CONSUMER_KEY'),
    MPESA_CONSUMER_SECRET: pick('consumerSecret', 'MPESA_CONSUMER_SECRET'),
    MPESA_SHORTCODE: pick('shortcode', 'MPESA_SHORTCODE'),
    MPESA_PASSKEY: pick('passkey', 'MPESA_PASSKEY'),
    MPESA_CALLBACK_URL: pick('callbackUrl', 'MPESA_CALLBACK_URL'),
  };
}

setMpesaEnvResolver(mergeMpesaEnvForDaraja);

function getLanIPv4(): string {
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

function getPrimaryMacAddress(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        return net.mac;
      }
    }
  }
  return '';
}

function isMpesaConfigured(): boolean {
  const e = mergeMpesaEnvForDaraja();
  return Boolean(
    e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && e.MPESA_SHORTCODE && e.MPESA_PASSKEY
  );
}

// Create sql helper function with proper types
const sql = (query: string, params: any[] = []): any => {
  try {
    const stmt = db.prepare(query);
    const queryType = query.trim().toUpperCase();
    const isSelectQuery = queryType.startsWith('SELECT') || 
                         queryType.startsWith('WITH') ||
                         queryType.startsWith('PRAGMA');
    
    if (isSelectQuery) {
      if (params && params.length > 0) {
        return stmt.all(...params);
      } else {
        return stmt.all();
      }
    } else {
      if (params && params.length > 0) {
        const result: any = stmt.run(...params);
        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
      } else {
        const result: any = stmt.run();
        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
      }
    }
  } catch (error) {
    console.error('SQL Error:', error);
    throw error;
  }
};

const API_BASENAME = '/api';
const api = new Hono<{ Variables: { posSessionToken: string | undefined } }>();

function getServerNetworkSnapshot(hostHeader?: string, protoHeader?: string) {
  const host = hostHeader || 'localhost';
  const proto = protoHeader || 'http';
  const g = globalThis as { __POS_HTTP_PORT__?: number };
  let port: number | undefined = g.__POS_HTTP_PORT__;
  if (port == null && host.includes(':')) {
    const p = parseInt(host.split(':')[1], 10);
    if (!Number.isNaN(p)) port = p;
  }
  if (port == null) {
    port = proto === 'https' ? 443 : 80;
  }
  const lan = getLanIPv4();
  const suggestedLanUrl = `http://${lan}:${port}`;
  const pageUrl = `${proto}://${host}`;
  let workstationName = '';
  try {
    ensureAppSettingsTable();
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('workstation_name') as { value: string } | undefined;
    workstationName = String(row?.value || '').trim();
  } catch {
    workstationName = '';
  }
  return {
    port,
    lanIPv4: lan,
    suggestedLanUrl,
    pageUrl,
    hostname: os.hostname(),
    macAddress: getPrimaryMacAddress(),
    workstationName,
    role: 'server',
  } as const;
}

function parseIpFromHost(host: string): string {
  const h = String(host || '').trim();
  if (!h) return '';
  if (h.includes(':')) {
    const [first] = h.split(':');
    return first;
  }
  return h;
}

function upsertWorkstationFromRequest(c: any) {
  try {
    ensureNetworkWorkstationsTable();
    const workstationId = String(c.req.header('x-workstation-id') || '').trim();
    if (!workstationId) return;
    const workstationName = String(c.req.header('x-workstation-name') || '').trim().slice(0, 120);
    const roleRaw = String(c.req.header('x-deployment-mode') || '').trim();
    const role = roleRaw === 'client' ? 'client' : roleRaw === 'server' ? 'server' : 'client';
    const origin = String(c.req.header('x-client-origin') || '').trim().slice(0, 255);
    const host = String(c.req.header('host') || '').trim();
    const ip = parseIpFromHost(host);
    const hostname = String(c.req.header('x-client-hostname') || '').trim();
    const macAddress = String(c.req.header('x-client-mac') || '').trim();
    db.prepare(
      `INSERT INTO network_workstations (workstation_id, workstation_name, hostname, role, last_ip, last_url, mac_address, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workstation_id) DO UPDATE SET
         workstation_name = COALESCE(excluded.workstation_name, network_workstations.workstation_name),
         hostname = COALESCE(excluded.hostname, network_workstations.hostname),
         role = COALESCE(excluded.role, network_workstations.role),
         last_ip = COALESCE(excluded.last_ip, network_workstations.last_ip),
         last_url = COALESCE(excluded.last_url, network_workstations.last_url),
         mac_address = COALESCE(excluded.mac_address, network_workstations.mac_address),
         last_seen_at = datetime('now')`
    ).run(workstationId, workstationName || null, hostname || null, role, ip || null, origin || null, macAddress || null);
  } catch (e) {
    console.error('upsertWorkstationFromRequest:', e);
  }
}

function getWorkstationRowById(id: string) {
  try {
    ensureNetworkWorkstationsTable();
    return db
      .prepare('SELECT * FROM network_workstations WHERE workstation_id = ?')
      .get(id) as
      | {
          workstation_id: string;
          suspended: number;
          suspend_reason?: string;
        }
      | undefined;
  } catch {
    return undefined;
  }
}

const NETWORK_ALLOWLIST = new Set([
  '/health',
  '/server-info',
  '/settings/currency',
  '/theme',
  '/network/self-status',
]);

/** Cookie, or Bearer / X-Session-Token (LAN clients: UI origin ≠ API origin, Lax cookies are not sent on fetch). */
function getPosSessionToken(c: Context): string | undefined {
  const cookieHeader = c.req.header('cookie') || '';
  const jar: Record<string, string> = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((part) => {
      const p = part.trim().split('=');
      if (p.length >= 2) {
        jar[p[0].trim()] = p.slice(1).join('=').trim();
      }
    });
  }
  if (jar.session_token) return jar.session_token;
  const auth = c.req.header('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (m?.[1]) return m[1];
  const xh = c.req.header('X-Session-Token')?.trim();
  if (xh) return xh;
  return undefined;
}

api.use('*', async (c, next) => {
  c.set('posSessionToken', getPosSessionToken(c));
  upsertWorkstationFromRequest(c);
  const workstationId = String(c.req.header('x-workstation-id') || '').trim();
  if (workstationId) {
    const row = getWorkstationRowById(workstationId);
    const method = String(c.req.method || 'GET').toUpperCase();
    const isReadOnly = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (row && Number(row.suspended) === 1 && !isReadOnly && !NETWORK_ALLOWLIST.has(c.req.path)) {
      return c.json(
        {
          error: 'Workstation suspended',
          suspended: true,
          reason: row.suspend_reason || 'Suspended by super admin',
          workstationId,
        },
        423
      );
    }
  }
  return next();
});

/** Health check for LAN clients configuring API base URL */
api.get('/health', (c) => {
  const snap = getServerNetworkSnapshot(c.req.header('Host') || 'localhost', c.req.header('X-Forwarded-Proto') || 'http');
  return c.json({ ok: true, service: 'pos-api', ts: new Date().toISOString(), ...snap });
});

/** Public: active shop theme JSON (for client installs + login screen). */
api.get('/theme', async (c) => {
  try {
    ensureAppSettingsTable();
    const row = db
      .prepare('SELECT value, updated_at FROM app_settings WHERE key = ?')
      .get('active_theme') as { value: string; updated_at: string } | undefined;
    if (!row?.value) {
      return c.json({ theme: null, updatedAt: null });
    }
    const theme = JSON.parse(row.value);
    return c.json({ theme, updatedAt: row.updated_at });
  } catch (error) {
    console.error('GET /api/theme:', error);
    return c.json({ error: 'Failed to load theme' }, 500);
  }
});

/** Public: HTTP port + LAN URL hints for Network page / client setup. */
api.get('/server-info', (c) => {
  try {
    const snap = getServerNetworkSnapshot(c.req.header('Host') || 'localhost', c.req.header('X-Forwarded-Proto') || 'http');
    return c.json(snap);
  } catch (error) {
    console.error('GET /api/server-info:', error);
    return c.json({ error: 'Failed to read server info' }, 500);
  }
});

api.post('/network/heartbeat', (c) => {
  try {
    upsertWorkstationFromRequest(c);
    return c.json({ ok: true, ts: new Date().toISOString() });
  } catch {
    return c.json({ ok: false }, 500);
  }
});

api.get('/network/self-status', (c) => {
  try {
    const workstationId = String(c.req.header('x-workstation-id') || '').trim();
    if (!workstationId) {
      return c.json({ suspended: false, workstationId: null });
    }
    const row = getWorkstationRowById(workstationId);
    return c.json({
      suspended: Boolean(row && Number(row.suspended) === 1),
      reason: row?.suspend_reason || '',
      workstationId,
    });
  } catch {
    return c.json({ suspended: false, workstationId: null });
  }
});

api.get('/admin/network/workstations', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    if (session.role !== 'super_admin') return c.json({ error: 'Forbidden' }, 403);

    ensureNetworkWorkstationsTable();
    const rows = db
      .prepare(
        `SELECT * FROM network_workstations
         ORDER BY datetime(last_seen_at) DESC`
      )
      .all() as any[];
    return c.json(rows || []);
  } catch (error) {
    console.error('GET /api/admin/network/workstations:', error);
    return c.json({ error: 'Failed to list workstations' }, 500);
  }
});

api.put('/admin/network/workstations/:id/suspend', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    if (session.role !== 'super_admin') return c.json({ error: 'Forbidden' }, 403);
    const id = String(c.req.param('id') || '').trim();
    const body = await c.req.json().catch(() => ({}));
    const suspended = Boolean(body?.suspended);
    const reason = String(body?.reason || '').trim().slice(0, 255);
    ensureNetworkWorkstationsTable();
    db.prepare(
      `UPDATE network_workstations
       SET suspended = ?, suspend_reason = ?, last_seen_at = datetime('now')
       WHERE workstation_id = ?`
    ).run(suspended ? 1 : 0, suspended ? (reason || 'Suspended by super admin') : null, id);
    return c.json({ ok: true, workstationId: id, suspended });
  } catch (error) {
    console.error('PUT /api/admin/network/workstations/:id/suspend:', error);
    return c.json({ error: 'Failed to update workstation state' }, 500);
  }
});

/** Super admin: set display/workstation name for this server host (broadcast via discovery). */
api.put('/admin/network/workstation-name', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const name = String(body?.name || '').trim().slice(0, 120);
    ensureAppSettingsTable();
    if (!name) {
      db.prepare('DELETE FROM app_settings WHERE key = ?').run('workstation_name');
    } else {
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).run('workstation_name', name);
    }
    return c.json({ ok: true, name });
  } catch (error) {
    console.error('PUT /api/admin/network/workstation-name:', error);
    return c.json({ error: 'Failed to save workstation name' }, 500);
  }
});

// Products routes
api.get('/products', async (c) => {
  try {
    const search = c.req.query('search');
    const category = c.req.query('category');
    const lowStock = c.req.query('lowStock');
    const expiryFilter = c.req.query('expiry'); // '', 'about_to_expire', 'expired'

    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ` AND (LOWER(name) LIKE LOWER(?) OR barcode LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (typeof category === 'string' && category.trim().length > 0) {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (lowStock === 'true') {
      query += ' AND stock_quantity <= min_stock_level';
    }

    // Expiry status filters
    // expiry_date stored as TEXT ISO date/time; use DATE() for comparison.
    if (expiryFilter === 'about_to_expire') {
      // Within next 30 days including today
      query +=
        " AND expiry_date IS NOT NULL AND DATE(expiry_date) >= DATE('now') AND DATE(expiry_date) <= DATE('now', '+30 day')";
    } else if (expiryFilter === 'expired') {
      // Already expired before today
      query += " AND expiry_date IS NOT NULL AND DATE(expiry_date) < DATE('now')";
    }

    query += ' ORDER BY name ASC';

    const products = await sql(query, params);
    return c.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return c.json({ error: 'Failed to fetch products' }, 500);
  }
});

api.post('/products', async (c) => {
  try {
    const body = await c.req.json();
    const {
      name,
      barcode,
      price,
      stock_quantity,
      min_stock_level,
      category,
      description,
      cost_price,
      expiry_date,
    } = body;

    if (!name || !price) {
      return c.json({ error: 'Name and price are required' }, 400);
    }

    const stock = stock_quantity || 0;
    const cost = cost_price != null ? Number(cost_price) : null;

    const result = await sql(
      `
      INSERT INTO products (name, barcode, price, stock_quantity, min_stock_level, category, description, cost_price, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        name,
        barcode || null,
        price,
        stock,
        min_stock_level || 10,
        category || null,
        description || null,
        cost != null && !Number.isNaN(cost) ? cost : null,
        expiry_date || null,
      ]
    );

    const newId = Number(result.lastInsertRowid);
    if (stock > 0) {
      addInventoryLot(newId, stock, cost != null && !Number.isNaN(cost) ? cost : 0);
    }

    const insertedProduct = await sql(`SELECT * FROM products WHERE id = ?`, [newId]);

    return c.json(insertedProduct[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    return c.json({ error: 'Failed to create product' }, 500);
  }
});

// Update product
api.put('/products/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = getSession(token);

    const { id } = c.req.param();
    const body = await c.req.json();
    const {
      name,
      barcode,
      price,
      stock_quantity,
      min_stock_level,
      category,
      description,
      cost_price,
      purchase_unit_cost,
      expiry_date,
    } = body;

    if (!name || !price) {
      return c.json({ error: 'Name and price are required' }, 400);
    }

    // Get original product data before update for activity log
    const originalProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(id)) as any;

    if (!originalProduct) {
      return c.json({ error: 'Product not found' }, 404);
    }

    const newStock = stock_quantity || 0;
    const oldStock = Number(originalProduct.stock_quantity) || 0;
    const delta = newStock - oldStock;

    const nextCostPrice =
      cost_price !== undefined && cost_price !== null && cost_price !== ''
        ? Number(cost_price)
        : originalProduct.cost_price;
    const purchaseUnit =
      purchase_unit_cost !== undefined && purchase_unit_cost !== null && purchase_unit_cost !== ''
        ? Number(purchase_unit_cost)
        : nextCostPrice;

    await sql(
      `
      UPDATE products 
      SET name = ?, barcode = ?, price = ?, stock_quantity = ?, min_stock_level = ?, category = ?, description = ?,
          cost_price = COALESCE(?, cost_price),
          expiry_date = COALESCE(?, expiry_date),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [
        name,
        barcode || null,
        price,
        newStock,
        min_stock_level || 10,
        category || null,
        description || null,
        cost_price !== undefined && cost_price !== null && cost_price !== '' ? Number(cost_price) : null,
        expiry_date || null,
        id,
      ]
    );

    if (delta > 0) {
      addInventoryLot(parseInt(id, 10), delta, Number.isFinite(purchaseUnit) ? purchaseUnit : 0);
    } else if (delta < 0) {
      shrinkInventoryLotsFifo(parseInt(id, 10), -delta);
    }

    const updatedProduct = await sql(`SELECT * FROM products WHERE id = ?`, [id]);
    
    if (updatedProduct.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // Log activity after update
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      const modifiedProduct = {
        ...originalProduct,
        name,
        barcode,
        price,
        stock_quantity: newStock,
        min_stock_level,
        category,
        description,
        cost_price: nextCostPrice,
      };

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, modified_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'product',
        parseInt(id),
        'update',
        JSON.stringify({ name, id: parseInt(id) }),
        JSON.stringify(originalProduct),
        JSON.stringify(modifiedProduct),
        session.userId,
        permanentDeleteAt.toISOString()
      );

      // Also log to user_activity_logs for individual user activity tracking
      try {
        db.prepare(`
          INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          session.userId,
          'update',
          `Modified product: ${name}`,
          'product',
          parseInt(id),
          JSON.stringify({
            product_id: parseInt(id),
            product_name: name,
            changes: {
              name: name !== originalProduct.name ? { from: originalProduct.name, to: name } : undefined,
              price: price !== originalProduct.price ? { from: originalProduct.price, to: price } : undefined,
              stock_quantity: newStock !== originalProduct.stock_quantity ? { from: originalProduct.stock_quantity, to: newStock } : undefined,
            }
          })
        );
      } catch (logError) {
        console.error('Failed to log user activity:', logError);
      }
    }

    return c.json(updatedProduct[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    return c.json({ error: 'Failed to update product' }, 500);
  }
});

// Delete product
api.delete('/products/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = getSession(token);

    const { id } = c.req.param();
    
    // Get product data before deletion for activity log
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(id)) as any;
    
    if (!product) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // Log activity before deletion
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'product',
        parseInt(id),
        'delete',
        JSON.stringify({ name: product.name, id: product.id }),
        JSON.stringify(product),
        session.userId,
        permanentDeleteAt.toISOString()
      );

      // Also log to user_activity_logs for individual user activity tracking
      try {
        db.prepare(`
          INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          session.userId,
          'delete',
          `Deleted product: ${product.name}`,
          'product',
          parseInt(id),
          JSON.stringify({
            product_id: parseInt(id),
            product_name: product.name,
            product_category: product.category
          })
        );
      } catch (logError) {
        console.error('Failed to log user activity:', logError);
      }
    }

    const result = await sql('DELETE FROM products WHERE id = ?', [id]);
    return c.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    return c.json({ error: 'Failed to delete product' }, 500);
  }
});

// Barcode route
api.get('/products/barcode/:barcode', async (c) => {
  try {
    const { barcode } = c.req.param();
    const product = await sql(`
      SELECT * FROM products WHERE barcode = ?
    `, [barcode]);

    if (product.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json(product[0]);
  } catch (error) {
    console.error('Error fetching product by barcode:', error);
    return c.json({ error: 'Failed to fetch product' }, 500);
  }
});

// Sales routes
api.get('/sales', async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const status = c.req.query('status');
    
    let query = `
      SELECT s.*, 
             COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND DATE(s.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(s.created_at) <= ?';
      params.push(endDate);
    }
    
    if (status) {
      query += ' AND s.payment_status = ?';
      params.push(status);
    }
    
    query += ' GROUP BY s.id ORDER BY s.created_at DESC';
    
    const sales = await sql(query, params);
    
    return c.json(sales);
  } catch (error) {
    console.error('Error fetching sales:', error);
    return c.json({ error: 'Failed to fetch sales' }, 500);
  }
});

// Get single sale by ID
api.get('/sales/:id', async (c) => {
  try {
    const { id } = c.req.param();
    
    const sale = await sql(`
      SELECT s.*
      FROM sales s
      WHERE s.id = ?
    `, [id]);
    
    if (sale.length === 0) {
      return c.json({ error: 'Sale not found' }, 404);
    }

    // Get sale items with product or service names
    const saleItems = await sql(`
      SELECT 
        si.*,
        COALESCE(p.name, s.name) as item_name,
        CASE WHEN si.product_id IS NOT NULL THEN 'product' ELSE 'service' END as item_type,
        p.name as product_name,
        s.name as service_name
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN services s ON si.service_id = s.id
      WHERE si.sale_id = ?
      ORDER BY si.id
    `, [id]);
    
    return c.json({ ...sale[0], items: saleItems, item_count: saleItems.length });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return c.json({ error: 'Failed to fetch sale' }, 500);
  }
});

api.post('/sales', async (c) => {
  try {
    // Get session for store_id and user_id
    const token = c.get('posSessionToken');
    
    let session: any = null;
    if (token) {
      session = getSession(token);
    }

    const { items, payment_method, mpesa_transaction_id } = await c.req.json();

    if (!items || items.length === 0) {
      return c.json({ error: 'Items are required' }, 400);
    }
    if (!payment_method) {
      return c.json({ error: 'Payment method is required' }, 400);
    }

    // Validate all items BEFORE creating the sale
    for (const item of items) {
      // Check if item is a service or product
      const isService = item.is_service || (item.service_id && !item.product_id);
      
      if (!item.product_id && !item.service_id) {
        return c.json({ error: 'Each item must have either product_id or service_id' }, 400);
      }
      
      if (!item.quantity || item.quantity <= 0) {
        return c.json({ error: 'Each item must have a valid quantity greater than 0' }, 400);
      }
      
      if (!item.unit_price || item.unit_price <= 0) {
        return c.json({ error: 'Each item must have a valid unit_price greater than 0' }, 400);
      }

      if (isService && item.service_id) {
        // Validate service exists
        const service = await sql(`SELECT * FROM services WHERE id = ?`, [item.service_id]);
        if (service.length === 0) {
          return c.json({ error: `Service with ID ${item.service_id} not found` }, 400);
        }
      } else if (item.product_id) {
        // Validate product exists and has enough stock
        const product = await sql(`SELECT * FROM products WHERE id = ?`, [item.product_id]);
        if (product.length === 0) {
          return c.json({ error: `Product with ID ${item.product_id} not found` }, 400);
        }
        if (product[0].stock_quantity < item.quantity) {
          return c.json({ 
            error: `Insufficient stock for ${product[0].name}. Available: ${product[0].stock_quantity}, Requested: ${item.quantity}` 
          }, 400);
        }
      } else {
        return c.json({ error: 'Item must have either product_id or service_id' }, 400);
      }
    }

    // Calculate total amount after validation
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    if (total_amount <= 0) {
      return c.json({ error: 'Total amount must be greater than 0' }, 400);
    }

    // Set payment status based on payment method
    // M-Pesa starts as 'pending', others are 'completed'
    const payment_status = payment_method === 'mpesa' ? 'pending' : 'completed';

    // Use database transaction to ensure atomicity - if any part fails, rollback everything
    let saleId;
    try {
      const transaction = db.transaction(() => {
        // Check if sales table has store_id and user_id columns
        const salesColumns = db.prepare("PRAGMA table_info(sales)").all() as any[];
        const hasStoreId = salesColumns.some(col => col.name === 'store_id');
        const hasUserId = salesColumns.some(col => col.name === 'user_id');
        
        // Build INSERT statement based on available columns
        let insertFields = 'total_amount, payment_method, payment_status';
        let insertValues: any[] = [total_amount, payment_method, payment_status];
        
        if (hasStoreId && session?.storeId) {
          insertFields += ', store_id';
          insertValues.push(session.storeId);
        }
        
        if (hasUserId && session?.userId) {
          insertFields += ', user_id';
          insertValues.push(session.userId);
        }
        
        if (mpesa_transaction_id) {
          insertFields += ', mpesa_transaction_id';
          insertValues.push(mpesa_transaction_id);
        }
        
        // Create sale record with appropriate payment status
        const saleResult = db.prepare(`
          INSERT INTO sales (${insertFields})
          VALUES (${insertValues.map(() => '?').join(', ')})
        `).run(...insertValues);

        const sid = saleResult.lastInsertRowid;

        // Create sale items and update stock (all validations passed)
        let itemsInserted = 0;
        for (const item of items) {
          // Check if item is a service or product
          const isService = item.is_service || (item.service_id && !item.product_id);
          
          if (isService && item.service_id) {
            // Create sale item for service (service_id field, product_id = NULL)
            sql(`
              INSERT INTO sale_items (sale_id, product_id, service_id, quantity, unit_price, total_price)
              VALUES (?, NULL, ?, ?, ?, ?)
            `, [sid, item.service_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);
            itemsInserted++;
          } else if (item.product_id) {
            const cogsAmount = consumeFifoCogs(item.product_id, item.quantity);
            // Create sale item for product (product_id field, service_id = NULL)
            sql(
              `
              INSERT INTO sale_items (sale_id, product_id, service_id, quantity, unit_price, total_price, cogs_amount)
              VALUES (?, ?, NULL, ?, ?, ?, ?)
            `,
              [
                sid,
                item.product_id,
                item.quantity,
                item.unit_price,
                item.quantity * item.unit_price,
                cogsAmount,
              ]
            );
            // Update product stock
            sql(
              `
              UPDATE products
              SET stock_quantity = stock_quantity - ?
              WHERE id = ?
            `,
              [item.quantity, item.product_id]
            );
            itemsInserted++;
          } else {
            throw new Error('Item must have either product_id or service_id');
          }
        }
        
        // Verify that all items were inserted successfully
        if (itemsInserted === 0) {
          throw new Error('No sale items were created');
        }
        
        if (itemsInserted !== items.length) {
          throw new Error(`Only ${itemsInserted} of ${items.length} items were created`);
        }
        
        return sid;
      });

      // Execute transaction - will rollback automatically if any error occurs
      saleId = transaction();
      
      // Get the created sale
      const sale = sql(`SELECT * FROM sales WHERE id = ?`, [saleId]);
      return c.json(sale[0]);
    } catch (transactionError: any) {
      // If transaction fails, the sale should be rolled back automatically
      // But if sale was created outside transaction, delete it manually
      if (saleId) {
        try {
          sql(`DELETE FROM sales WHERE id = ?`, [saleId]);
        } catch (deleteError) {
          console.error('Failed to clean up sale after transaction error:', deleteError);
        }
      }
      throw transactionError;
    }
  } catch (error: any) {
    console.error('Error creating sale:', error);
    return c.json({ error: error.message || 'Failed to create sale' }, 500);
  }
});

// Alerts routes  
api.get('/alerts', async (c) => {
  try {
    // Generate alerts dynamically from low stock products
    const lowStockProducts = await sql(`
      SELECT id, name, stock_quantity, min_stock_level
      FROM products
      WHERE stock_quantity <= min_stock_level
      ORDER BY stock_quantity ASC
    `);

    const alerts = lowStockProducts.map((product, index) => ({
      id: index + 1,
      product_id: product.id,
      product_name: product.name,
      stock_quantity: product.stock_quantity,
      min_stock_level: product.min_stock_level,
      alert_type: product.stock_quantity === 0 ? 'out_of_stock' : 'low_stock',
      is_read: false,
      created_at: new Date().toISOString()
    }));

    return c.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return c.json({ error: 'Failed to fetch alerts' }, 500);
  }
});

// Note: Mark as read functionality is handled client-side via localStorage
// since alerts are dynamically generated and don't exist in the database

// M-Pesa STK Push — aligned with apps/web/src/app/api/mpesa/stk-push/route.js
api.post('/mpesa/stk-push', async (c) => {
  try {
    const body = await c.req.json();
    const phone_number = body.phone_number;
    const amount = body.amount;
    const sale_id = body.sale_id;

    if (!phone_number || amount == null) {
      return c.json({ error: 'Phone number and amount are required' }, 400);
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return c.json({ error: 'Amount must be a positive number' }, 400);
    }

    let formattedPhone: string;
    try {
      formattedPhone = formatPhoneNumber(phone_number);
    } catch (error: any) {
      return c.json({ error: `Invalid phone number format: ${error.message}` }, 400);
    }

    if (!isMpesaConfigured()) {
      const checkoutRequestID = `MOCK_CO_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      if (sale_id) {
        try {
          db.exec(`
            CREATE TABLE IF NOT EXISTS mpesa_checkout_mapping (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              checkout_request_id TEXT UNIQUE NOT NULL,
              sale_id INTEGER NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (sale_id) REFERENCES sales(id)
            )
          `);
          sql(
            `INSERT OR REPLACE INTO mpesa_checkout_mapping (checkout_request_id, sale_id) VALUES (?, ?)`,
            [checkoutRequestID, sale_id]
          );
        } catch (e) {
          console.error('mpesa_checkout_mapping (mock):', e);
        }

        const mockTxnId = `TXN${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
        const isSuccess = Math.random() > 0.15;
        setTimeout(() => {
          try {
            if (isSuccess) {
              sql(
                `UPDATE sales SET payment_status = ?, mpesa_transaction_id = ?, mpesa_payer_name = ? WHERE id = ?`,
                ['completed', mockTxnId, 'Demo Customer (mock)', sale_id]
              );
            } else {
              sql(`UPDATE sales SET payment_status = ? WHERE id = ?`, ['failed', sale_id]);
            }
          } catch (err) {
            console.error('Mock M-Pesa delayed update:', err);
          }
        }, 4200);
      }

      return c.json({
        success: true,
        checkoutRequestID,
        message:
          'STK Push initiated (mock). Customer prompt simulated — payment status updates in a few seconds.',
        mock: true,
        initiated: true,
      });
    }

    try {
      const stkResponse = await initiateSTKPush({
        phoneNumber: formattedPhone,
        amount: numericAmount,
        accountReference: sale_id ? `SALE_${sale_id}` : 'POS_SALE',
        transactionDesc: `Payment for sale ${sale_id || 'unknown'}`,
      });

      if (sale_id && stkResponse.checkoutRequestID) {
        try {
          db.exec(`
            CREATE TABLE IF NOT EXISTS mpesa_checkout_mapping (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              checkout_request_id TEXT UNIQUE NOT NULL,
              sale_id INTEGER NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (sale_id) REFERENCES sales(id)
            )
          `);
          sql(
            `INSERT OR REPLACE INTO mpesa_checkout_mapping (checkout_request_id, sale_id) VALUES (?, ?)`,
            [stkResponse.checkoutRequestID, sale_id]
          );
        } catch (error) {
          console.error('Error storing checkout mapping:', error);
        }
      }

      return c.json({
        success: true,
        merchantRequestID: stkResponse.merchantRequestID,
        checkoutRequestID: stkResponse.checkoutRequestID,
        customerMessage: stkResponse.customerMessage,
        message: 'STK Push initiated successfully. Customer will receive a prompt on their phone.',
      });
    } catch (error: any) {
      console.error('Error initiating STK Push:', error);
      if (sale_id) {
        try {
          sql(`UPDATE sales SET payment_status = ? WHERE id = ?`, ['failed', sale_id]);
        } catch {
          /* ignore */
        }
      }
      return c.json(
        {
          success: false,
          message: error.message || 'Failed to initiate STK Push. Please try again.',
        },
        400
      );
    }
  } catch (error: any) {
    console.error('Error processing STK push:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to process payment',
        message: error.message || 'An unexpected error occurred',
      },
      500
    );
  }
});

// M-Pesa callback — updates sale + mpesa_payer_name (sync sql)
api.post('/mpesa/callback', async (c) => {
  try {
    const callbackData = await c.req.json();

    if (!validateCallback(callbackData)) {
      return c.json({ ResultCode: 1, ResultDesc: 'Invalid callback data' }, 400);
    }

    const parsed = parseCallback(callbackData);
    const payerLabel =
      parsed.firstName ||
      (parsed.phoneNumber ? `Customer (${parsed.phoneNumber})` : null);

    const stkCallback = callbackData.Body?.stkCallback;
    const checkoutRequestID = stkCallback?.CheckoutRequestID;

    let saleId: number | null = null;
    const mapping = sql(
      `SELECT sale_id FROM mpesa_checkout_mapping WHERE checkout_request_id = ? LIMIT 1`,
      [checkoutRequestID]
    ) as { sale_id: number }[];

    if (mapping && mapping.length > 0) {
      saleId = mapping[0].sale_id;
    }

    if (parsed.success && parsed.transactionID && saleId) {
      sql(
        `UPDATE sales SET payment_status = ?, mpesa_transaction_id = ?, mpesa_payer_name = ? WHERE id = ?`,
        ['completed', parsed.transactionID, payerLabel, saleId]
      );
    } else if (!parsed.success && saleId) {
      sql(`UPDATE sales SET payment_status = ? WHERE id = ?`, ['failed', saleId]);
    }

    return c.json({ ResultCode: 0, ResultDesc: 'Callback received and processed successfully' });
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    return c.json({ ResultCode: 0, ResultDesc: 'Callback received' });
  }
});

// Services routes
api.get('/services', async (c) => {
  try {
    const { search, category } = c.req.query();

    let query = 'SELECT * FROM services WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ` AND (LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (typeof category === 'string' && category.trim().length > 0) {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ' ORDER BY category, name ASC';

    const services = await sql(query, params);
    return c.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    return c.json({ error: 'Failed to fetch services' }, 500);
  }
});

api.post('/services', async (c) => {
  try {
    const { name, category, price, price_type, price_config, description, duration, features } = await c.req.json();

    if (!name || !price || !category) {
      return c.json({ error: 'Name, category, and price are required' }, 400);
    }

    const result = await sql(`
      INSERT INTO services (name, category, price, price_type, price_config, description, duration, features)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, category, price, price_type || 'fixed', price_config || null, description || null, duration || null, features || null]);
    
    const insertedService = await sql(`
      SELECT * FROM services WHERE id = ?
    `, [result.lastInsertRowid]);

    return c.json(insertedService[0]);
  } catch (error) {
    console.error('Error creating service:', error);
    return c.json({ error: 'Failed to create service' }, 500);
  }
});

// Get all categories for products
api.get('/categories/products', async (c) => {
  try {
    const categories = await sql("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC");
    return c.json(categories.map(row => row.category));
  } catch (error) {
    console.error('Error fetching product categories:', error);
    return c.json({ error: 'Failed to fetch product categories' }, 500);
  }
});

// Get all categories for services
api.get('/categories/services', async (c) => {
  try {
    const categories = await sql("SELECT DISTINCT category FROM services WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC");
    return c.json(categories.map(row => row.category));
  } catch (error) {
    console.error('Error fetching service categories:', error);
    return c.json({ error: 'Failed to fetch service categories' }, 500);
  }
});

// Get all categories for expenses
api.get('/categories/expenses', async (c) => {
  try {
    const categories = await sql("SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC");
    return c.json(categories.map(row => row.category));
  } catch (error) {
    console.error('Error fetching expense categories:', error);
    return c.json({ error: 'Failed to fetch expense categories' }, 500);
  }
});

api.get('/services/:id', async (c) => {
  try {
    const { id } = c.req.param();
    
    const services = await sql('SELECT * FROM services WHERE id = ?', [id]);
    
    if (services.length === 0) {
      return c.json({ error: 'Service not found' }, 404);
    }
    
    return c.json(services[0]);
  } catch (error) {
    console.error('Error fetching service:', error);
    return c.json({ error: 'Failed to fetch service' }, 500);
  }
});

api.put('/services/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = getSession(token);

    const { id } = c.req.param();
    const { name, category, price, price_type, price_config, description, duration, features } = await c.req.json();

    if (!name || !price || !category) {
      return c.json({ error: 'Name, category, and price are required' }, 400);
    }

    // Get original service data before update for activity log
    const originalService = db.prepare('SELECT * FROM services WHERE id = ?').get(parseInt(id)) as any;
    
    if (!originalService) {
      return c.json({ error: 'Service not found' }, 404);
    }

    await sql(`
      UPDATE services 
      SET name = ?, category = ?, price = ?, price_type = ?, price_config = ?, description = ?, duration = ?, features = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, category, price, price_type || 'fixed', price_config || null, description || null, duration || null, features || null, id]);
    
    const updatedServices = await sql('SELECT * FROM services WHERE id = ?', [id]);

    // Log activity after update
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      const modifiedService = { ...originalService, name, category, price, price_type, price_config, description, duration, features };

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, modified_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'service',
        parseInt(id),
        'update',
        JSON.stringify({ name, id: parseInt(id) }),
        JSON.stringify(originalService),
        JSON.stringify(modifiedService),
        session.userId,
        permanentDeleteAt.toISOString()
      );

      // Also log to user_activity_logs for individual user activity tracking
      try {
        db.prepare(`
          INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          session.userId,
          'update',
          `Modified service: ${name}`,
          'service',
          parseInt(id),
          JSON.stringify({
            service_id: parseInt(id),
            service_name: name,
            changes: {
              name: name !== originalService.name ? { from: originalService.name, to: name } : undefined,
              category: category !== originalService.category ? { from: originalService.category, to: category } : undefined,
              price: price !== originalService.price ? { from: originalService.price, to: price } : undefined,
            }
          })
        );
      } catch (logError) {
        console.error('Failed to log user activity:', logError);
      }
    }

    return c.json(updatedServices[0]);
  } catch (error) {
    console.error('Error updating service:', error);
    return c.json({ error: 'Failed to update service' }, 500);
  }
});

api.delete('/services/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = getSession(token);

    const { id } = c.req.param();
    
    // Get service data before deletion for activity log
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(parseInt(id)) as any;
    
    if (!service) {
      return c.json({ error: 'Service not found' }, 404);
    }

    // Log activity before deletion
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'service',
        parseInt(id),
        'delete',
        JSON.stringify({ name: service.name, id: service.id }),
        JSON.stringify(service),
        session.userId,
        permanentDeleteAt.toISOString()
      );

      // Also log to user_activity_logs for individual user activity tracking
      try {
        db.prepare(`
          INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          session.userId,
          'delete',
          `Deleted service: ${service.name}`,
          'service',
          parseInt(id),
          JSON.stringify({
            service_id: parseInt(id),
            service_name: service.name,
            service_category: service.category
          })
        );
      } catch (logError) {
        console.error('Failed to log user activity:', logError);
      }
    }
    
    await sql('DELETE FROM services WHERE id = ?', [id]);
    
    return c.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    return c.json({ error: 'Failed to delete service' }, 500);
  }
});

// Dashboard stats endpoint
api.get('/dashboard/stats', async (c) => {
  try {
    const period = c.req.query('period') || 'today';
    
    // Calculate date range based on period
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = "AND DATE(created_at) = DATE('now')";
    } else if (period === 'yesterday') {
      dateFilter = "AND DATE(created_at) = DATE('now', '-1 day')";
    } else if (period === 'week' || period === 'last7') {
      dateFilter = "AND created_at >= datetime('now', '-7 days')";
    } else if (period === 'month' || period === 'last30') {
      dateFilter = "AND created_at >= datetime('now', '-30 days')";
    } else if (period === 'year') {
      dateFilter = "AND created_at >= datetime('now', '-365 days')";
    } else if (period === 'all') {
      dateFilter = ''; // No filter for all time
    }
    
    // Get sales statistics (only completed sales)
    const salesStats = await sql(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales 
      WHERE payment_status = 'completed' ${dateFilter}
    `);
    
    // Get product statistics
    const productStats = await sql(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_quantity <= min_stock_level THEN 1 END) as low_stock_products,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_count
      FROM products
    `);
    
    // Get top selling products (only completed sales)
    const topProducts = await sql(`
      SELECT 
        p.id,
        p.name,
        p.price,
        SUM(si.quantity) as total_sold,
        SUM(si.total_price) as total_revenue
      FROM products p
      JOIN sale_items si ON si.product_id = p.id
      JOIN sales s ON s.id = si.sale_id
      WHERE s.payment_status = 'completed'
      GROUP BY p.id, p.name, p.price
      ORDER BY total_sold DESC
    `);
    
    // Get all recent sales with item count (no date filter, all statuses for display)
    const recentSales = await sql(`
      SELECT 
        s.id,
        s.total_amount,
        COUNT(si.id) as item_count,
        s.payment_method,
        s.payment_status,
        s.created_at
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    
    const stats = {
      sales: salesStats[0] || { total_sales: 0, total_revenue: 0 },
      products: productStats[0] || { total_products: 0, low_stock_products: 0, out_of_stock_count: 0 },
      top_products: topProducts || [],
      recent_sales: recentSales || []
    };
    
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return c.json({ error: 'Failed to fetch dashboard stats' }, 500);
  }
});

/** Theme background upload (used by admin Themes page). File-based route.js is not wired — must live on Hono api. */
const THEME_BG_ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const THEME_BG_MAX_BYTES = 8 * 1024 * 1024;

api.get('/theme/background-file/:name', async (c) => {
  const name = String(c.req.param('name') || '');
  if (!/^[0-9a-f-]{36}\.(jpe?g|png|webp|gif)$/i.test(name)) {
    return c.text('Not found', 404);
  }
  const fp = path.join(resolveThemeBackgroundsDir(), name);
  try {
    const buf = await readFile(fp);
    const ext = path.extname(name).toLowerCase();
    const type =
      ext === '.webp'
        ? 'image/webp'
        : ext === '.png'
          ? 'image/png'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    return new Response(buf, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return c.text('Not found', 404);
  }
});

api.post('/theme/background', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || typeof (file as Blob).arrayBuffer !== 'function') {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const f = file as File;
    const mime = f.type || '';
    if (!THEME_BG_ALLOWED.has(mime)) {
      return c.json(
        { error: 'Invalid image type. Use JPEG, PNG, WebP, or GIF.' },
        400
      );
    }

    const buffer = Buffer.from(await f.arrayBuffer());
    if (buffer.length > THEME_BG_MAX_BYTES) {
      return c.json({ error: 'File too large (max 8MB)' }, 400);
    }

    const ext = THEME_BG_ALLOWED.get(mime)!;
    const filename = `${crypto.randomUUID()}${ext}`;
    const publicDir = resolveThemeBackgroundsDir();
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, filename), buffer);

    const url = `/api/theme/background-file/${filename}`;
    return c.json({ url });
  } catch (error) {
    console.error('POST /api/theme/background:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

/** Persist full theme JSON (admin — LAN clients read via GET /api/theme). */
api.put('/theme', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (session.role !== 'admin' && session.role !== 'super_admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const body = await c.req.json();
    ensureAppSettingsTable();

    if (body.theme === null || body.theme === undefined) {
      db.prepare('DELETE FROM app_settings WHERE key = ?').run('active_theme');
      return c.json({ ok: true });
    }

    const theme = body.theme;
    if (typeof theme !== 'object' || theme === null) {
      return c.json({ error: 'Invalid theme' }, 400);
    }

    const json = JSON.stringify(theme);
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run('active_theme', json);

    return c.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/theme:', error);
    return c.json({ error: 'Failed to save theme' }, 500);
  }
});

/** Super admin: read payment config (Daraja + card / Stripe). Merges DB with env for display. */
api.get('/admin/payment-settings', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const stored = getPaymentConfigFromDb();
    const sm = stored.mpesa || {};
    const sc = stored.card || {};
    const sn = stored.ngrok || {};
    const cur = stored.currency || {};

    const mpesa = {
      env: (sm.env || process.env.MPESA_ENV || 'sandbox') === 'production' ? 'production' : 'sandbox',
      consumerKey: sm.consumerKey ?? process.env.MPESA_CONSUMER_KEY ?? '',
      consumerSecret: sm.consumerSecret ?? process.env.MPESA_CONSUMER_SECRET ?? '',
      shortcode: sm.shortcode ?? process.env.MPESA_SHORTCODE ?? '',
      passkey: sm.passkey ?? process.env.MPESA_PASSKEY ?? '',
      callbackUrl: sm.callbackUrl ?? process.env.MPESA_CALLBACK_URL ?? '',
    };

    const card = {
      stripePublishableKey: sc.stripePublishableKey ?? '',
      stripeSecretKey: sc.stripeSecretKey ?? '',
      stripeWebhookSecret: sc.stripeWebhookSecret ?? '',
    };

    const ngrok = {
      autoStartTunnel: Boolean(sn.autoStartTunnel),
      autoApplyCallback: Boolean(sn.autoApplyCallback),
      tunnelPort: Number(sn.tunnelPort) > 0 ? Number(sn.tunnelPort) : 4000,
    };
    const timezoneMode = (stored.timezone?.mode === 'manual' ? 'manual' : 'auto') as 'auto' | 'manual';
    const machineTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const timezoneValue = String(stored.timezone?.value || machineTimezone);
    const dateTimeLocale = String(stored.dateTimeLocale || 'en-US');
    const timezone = {
      mode: timezoneMode,
      value: timezoneValue,
      effective: timezoneMode === 'manual' ? timezoneValue : machineTimezone,
      detected: machineTimezone,
      dateTimeLocale,
    };
    const currency = {
      code: String(cur.code || 'USD').toUpperCase(),
      locale: String(cur.locale || 'en-US'),
    };

    return c.json({ mpesa, card, ngrok, currency, timezone });
  } catch (error) {
    console.error('GET /api/admin/payment-settings:', error);
    return c.json({ error: 'Failed to load payment settings' }, 500);
  }
});

api.put('/admin/payment-settings', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = token ? getSession(token) : null;
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const body = await c.req.json();
    const mpesaIn = body.mpesa || {};
    const cardIn = body.card || {};
    const ngrokIn = body.ngrok || {};
    const currencyIn = body.currency || {};
    const timezoneIn = body.timezone || {};
    const currencyCode = String(currencyIn.code || 'USD').trim().toUpperCase() || 'USD';
    const currencyLocale = String(currencyIn.locale || 'en-US').trim() || 'en-US';
    const timezoneMode = timezoneIn.mode === 'manual' ? 'manual' : 'auto';
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const dateTimeLocale = String(body.dateTimeLocale || 'en-US').trim() || 'en-US';
    const timezoneValueRaw = String(timezoneIn.value || detectedTimezone).trim();
    let timezoneValue = detectedTimezone;
    if (timezoneMode === 'manual') {
      try {
        // Validate manual timezone by attempting format construction
        new Intl.DateTimeFormat('en-US', { timeZone: timezoneValueRaw });
        timezoneValue = timezoneValueRaw;
      } catch {
        timezoneValue = detectedTimezone;
      }
    }

    const next: PaymentConfigFile = {
      mpesa: {
        env: String(mpesaIn.env || 'sandbox'),
        consumerKey: String(mpesaIn.consumerKey ?? ''),
        consumerSecret: String(mpesaIn.consumerSecret ?? ''),
        shortcode: String(mpesaIn.shortcode ?? ''),
        passkey: String(mpesaIn.passkey ?? ''),
        callbackUrl: String(mpesaIn.callbackUrl ?? ''),
      },
      card: {
        stripePublishableKey: String(cardIn.stripePublishableKey ?? ''),
        stripeSecretKey: String(cardIn.stripeSecretKey ?? ''),
        stripeWebhookSecret: String(cardIn.stripeWebhookSecret ?? ''),
      },
      ngrok: {
        autoStartTunnel: Boolean(ngrokIn.autoStartTunnel),
        autoApplyCallback: Boolean(ngrokIn.autoApplyCallback),
        tunnelPort: Number(ngrokIn.tunnelPort) > 0 ? Number(ngrokIn.tunnelPort) : 4000,
      },
      currency: {
        code: currencyCode,
        locale: currencyLocale,
      },
      timezone: {
        mode: timezoneMode,
        value: timezoneValue,
      },
      dateTimeLocale,
    };

    ensureAppSettingsTable();
    const json = JSON.stringify(next);
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run('payment_config', json);

    return c.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/admin/payment-settings:', error);
    return c.json({ error: 'Failed to save payment settings' }, 500);
  }
});

/** Public currency preference used by POS + dashboards. */
api.get('/settings/currency', async (c) => {
  try {
    const stored = getPaymentConfigFromDb();
    const cur = stored.currency || {};
    const code = String(cur.code || 'USD').toUpperCase();
    const locale = String(cur.locale || 'en-US');
    return c.json({ code, locale });
  } catch (error) {
    console.error('GET /api/settings/currency:', error);
    return c.json({ code: 'USD', locale: 'en-US' });
  }
});

/** Public timezone preference used by POS + dashboards (clients follow server timezone). */
api.get('/settings/timezone', async (c) => {
  try {
    const stored = getPaymentConfigFromDb();
    const tz = stored.timezone || {};
    const mode = tz.mode === 'manual' ? 'manual' : 'auto';
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const value = String(tz.value || detected);
    const effective = mode === 'manual' ? value : detected;
    const dateTimeLocale = String(stored.dateTimeLocale || 'en-US');
    return c.json({ mode, value, effective, detected, dateTimeLocale });
  } catch (error) {
    console.error('GET /api/settings/timezone:', error);
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return c.json({ mode: 'auto', value: detected, effective: detected, detected, dateTimeLocale: 'en-US' });
  }
});

// Expenses routes
api.get('/expenses', async (c) => {
  try {
    const { startDate, endDate, category } = c.req.query();
    
    // Backfill period_start and period_end for existing expenses that don't have them
    // Set period to the expense date (same day) as a default
    try {
      await sql(`
        UPDATE expenses 
        SET period_start = date, period_end = date
        WHERE period_start IS NULL OR period_end IS NULL
      `);
    } catch (err) {
      // Ignore if columns don't exist yet or update fails
      console.log('Note: Could not backfill expense periods:', err);
    }
    
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND DATE(date) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(date) <= ?';
      params.push(endDate);
    }

    if (typeof category === 'string' && category.trim().length > 0) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    query += ' ORDER BY date DESC';
    
    const expenses = await sql(query, params);
    return c.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return c.json({ error: 'Failed to fetch expenses' }, 500);
  }
});

api.post('/expenses', async (c) => {
  try {
    const { title, description, category, amount, date, receipt_url, notes, period_start, period_end } = await c.req.json();
    
    if (!title || !category || !amount || !date) {
      return c.json({ error: 'Title, category, amount, and date are required' }, 400);
    }
    
    const result = await sql(`
      INSERT INTO expenses (title, description, category, amount, date, receipt_url, notes, period_start, period_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, description || null, category, amount, date, receipt_url || null, notes || null, period_start || null, period_end || null]);
    
    const expense = await sql(`SELECT * FROM expenses WHERE id = ?`, [result.lastInsertRowid]);
    return c.json(expense[0]);
  } catch (error: any) {
    console.error('Error creating expense:', error);
    return c.json({ error: error.message || 'Failed to create expense' }, 500);
  }
});

api.put('/expenses/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');
    
    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    
    const session = getSession(token);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const { id } = c.req.param();
    const { title, description, category, amount, date, receipt_url, notes, period_start, period_end } = await c.req.json();
    
    if (!title || !category || !amount || !date || !period_start || !period_end) {
      return c.json({ error: 'Title, category, amount, date, period_start, and period_end are required' }, 400);
    }

    // Get original expense data before update for activity log
    const originalExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(parseInt(id)) as any;
    
    if (!originalExpense) {
      return c.json({ error: 'Expense not found' }, 404);
    }
    
    await sql(`
      UPDATE expenses 
      SET title = ?, description = ?, category = ?, amount = ?, date = ?, receipt_url = ?, notes = ?, period_start = ?, period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, description || null, category, amount, date, receipt_url || null, notes || null, period_start, period_end, id]);
    
    const expense = await sql(`SELECT * FROM expenses WHERE id = ?`, [id]);

    // Log activity after update
    if (session) {
      try {
        ensureActivityLogTable();
        const retention = getRetentionDays();
        const permanentDeleteAt = new Date();
        permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

        const modifiedExpense = { ...originalExpense, title, description, category, amount, date, receipt_url, notes, period_start, period_end };

        db.prepare(`
          INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, modified_data, performed_by, permanent_delete_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'expense',
          parseInt(id),
          'update',
          JSON.stringify({ title, id: parseInt(id) }),
          JSON.stringify(originalExpense),
          JSON.stringify(modifiedExpense),
          session.userId,
          permanentDeleteAt.toISOString()
        );

        // Also log to user_activity_logs for individual user activity tracking
        try {
          db.prepare(`
            INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            session.userId,
            'update',
            `Modified expense: ${title}`,
            'expense',
            parseInt(id),
            JSON.stringify({
              expense_id: parseInt(id),
              expense_title: title,
              changes: {
                title: title !== originalExpense.title ? { from: originalExpense.title, to: title } : undefined,
                amount: amount !== originalExpense.amount ? { from: originalExpense.amount, to: amount } : undefined,
                category: category !== originalExpense.category ? { from: originalExpense.category, to: category } : undefined,
              }
            })
          );
        } catch (userLogError) {
          console.error('Failed to log user activity:', userLogError);
        }
      } catch (logError) {
        console.error('Failed to log expense update activity:', logError);
        // Don't fail the request if logging fails
      }
    }
    
    if (expense.length === 0) {
      return c.json({ error: 'Expense not found' }, 404);
    }
    
    return c.json(expense[0]);
  } catch (error: any) {
    console.error('Error updating expense:', error);
    return c.json({ error: error.message || 'Failed to update expense' }, 500);
  }
});

api.delete('/expenses/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = getSession(token);

    const { id } = c.req.param();
    
    // Get expense data before deletion for activity log
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(parseInt(id)) as any;
    
    if (!expense) {
      return c.json({ error: 'Expense not found' }, 404);
    }

    // Log activity before deletion
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'expense',
        parseInt(id),
        'delete',
        JSON.stringify({ title: expense.title, id: expense.id }),
        JSON.stringify(expense),
        session.userId,
        permanentDeleteAt.toISOString()
      );

      // Also log to user_activity_logs for individual user activity tracking
      try {
        db.prepare(`
          INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          session.userId,
          'delete',
          `Deleted expense: ${expense.title}`,
          'expense',
          parseInt(id),
          JSON.stringify({
            expense_id: parseInt(id),
            expense_title: expense.title,
            expense_category: expense.category,
            expense_amount: expense.amount
          })
        );
      } catch (logError) {
        console.error('Failed to log user activity:', logError);
      }
    }
    
    await sql(`DELETE FROM expenses WHERE id = ?`, [id]);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting expense:', error);
    return c.json({ error: error.message || 'Failed to delete expense' }, 500);
  }
});

// Analytics routes
api.get('/analytics/summary', async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    
    // Only count completed sales for revenue
    let salesQuery = `
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales
      WHERE payment_status = 'completed'
    `;
    let expenseQuery = `
      SELECT 
        COUNT(*) as total_expenses,
        COALESCE(SUM(amount), 0) as total_expense_amount
      FROM expenses
      WHERE 1=1
    `;
    const params: any[] = [];
    const expenseParams: any[] = [];
    
    if (startDate) {
      salesQuery += ' AND DATE(created_at) >= ?';
      expenseQuery += ' AND DATE(date) >= ?';
      params.push(startDate);
      expenseParams.push(startDate);
    }
    
    if (endDate) {
      salesQuery += ' AND DATE(created_at) <= ?';
      expenseQuery += ' AND DATE(date) <= ?';
      params.push(endDate);
      expenseParams.push(endDate);
    }
    
    const salesResult = await sql(salesQuery, params);
    const expenseResult = await sql(expenseQuery, expenseParams);
    
    const totalRevenue = parseFloat(salesResult[0]?.total_revenue || 0);
    
    // Include product COGS as part of expenses so buying price for sold units is reflected
    let totalCOGS = 0;
    try {
      const cogsQuery = await sql(`
        SELECT SUM(COALESCE(si.cogs_amount, COALESCE(p.cost_price, 0) * si.quantity)) as total_cogs
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN products p ON si.product_id = p.id
        WHERE s.payment_status = 'completed'
      `, []);
      totalCOGS = parseFloat(cogsQuery[0]?.total_cogs || 0);
    } catch (err) {
      totalCOGS = 0;
    }

    const manualExpenses = parseFloat(expenseResult[0]?.total_expense_amount || 0);
    const totalExpenses = manualExpenses + totalCOGS;
    const profit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    
    return c.json({
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit: profit,
      profit_margin: profitMargin,
      sales_count: salesResult[0]?.total_sales || 0,
      expenses_count: expenseResult[0]?.total_expenses || 0
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    return c.json({ error: 'Failed to fetch analytics summary' }, 500);
  }
});

api.get('/analytics/product-profitability', async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    
    let query = `
      SELECT 
        p.id,
        p.name,
        p.category,
        p.price,
        COALESCE(p.cost_price, 0) as cost_price,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.total_price) as total_revenue,
        SUM(COALESCE(si.cogs_amount, si.quantity * COALESCE(p.cost_price, 0))) as total_cost,
        SUM(si.total_price) - SUM(COALESCE(si.cogs_amount, si.quantity * COALESCE(p.cost_price, 0))) as profit,
        CASE 
          WHEN SUM(si.total_price) > 0 
          THEN ((SUM(si.total_price) - SUM(COALESCE(si.cogs_amount, si.quantity * COALESCE(p.cost_price, 0)))) / SUM(si.total_price)) * 100
          ELSE 0
        END as profit_margin
      FROM products p
      INNER JOIN sale_items si ON p.id = si.product_id
      INNER JOIN sales s ON si.sale_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND DATE(s.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(s.created_at) <= ?';
      params.push(endDate);
    }
    
    query += ' GROUP BY p.id ORDER BY profit DESC';
    
    const products = await sql(query, params);
    return c.json(products);
  } catch (error) {
    console.error('Error fetching product profitability:', error);
    return c.json({ error: 'Failed to fetch product profitability' }, 500);
  }
});

api.get('/analytics/sales-trends', async (c) => {
  try {
    const { days: daysQ, startDate: qStart, endDate: qEnd } = c.req.query();

    /** Date filter: explicit range, or rolling `days`, or none (all time). */
    const buildDateFilter = (columnSql: string, params: any[]) => {
      const s = qStart && String(qStart).trim();
      const e = qEnd && String(qEnd).trim();
      let clause = '';
      if (s) {
        clause += ` AND DATE(${columnSql}) >= ?`;
        params.push(s);
      }
      if (e) {
        clause += ` AND DATE(${columnSql}) <= ?`;
        params.push(e);
      }
      if (clause) return clause;
      const d = daysQ != null && String(daysQ) !== '' ? parseInt(String(daysQ), 10) : NaN;
      if (!Number.isNaN(d) && d > 0) {
        params.push(d);
        return ` AND DATE(${columnSql}) >= date('now', '-' || ? || ' days')`;
      }
      return '';
    };

    const salesParams: any[] = [];
    let salesQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as sales_count,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM sales
      WHERE payment_status = 'completed'
    `;
    salesQuery += buildDateFilter('created_at', salesParams);
    salesQuery += ' GROUP BY DATE(created_at) ORDER BY date ASC';

    const expenseParams: any[] = [];
    let expenseQuery = `
      SELECT
        DATE(date) as date,
        COALESCE(SUM(amount), 0) as expenses
      FROM expenses
      WHERE 1=1
    `;
    expenseQuery += buildDateFilter('date', expenseParams);
    expenseQuery += ' GROUP BY DATE(date) ORDER BY date ASC';

    const salesRows: any[] = await sql(salesQuery, salesParams);
    const expenseRows: any[] = await sql(expenseQuery, expenseParams);

    const byDate = new Map<string, { date: string; sales_count: number; revenue: number; expenses: number }>();

    for (const r of salesRows || []) {
      const d = r.date;
      if (!d) continue;
      byDate.set(d, {
        date: d,
        sales_count: Number(r.sales_count) || 0,
        revenue: parseFloat(String(r.revenue ?? 0)) || 0,
        expenses: 0,
      });
    }
    for (const r of expenseRows || []) {
      const d = r.date;
      if (!d) continue;
      const exp = parseFloat(String(r.expenses ?? 0)) || 0;
      const existing = byDate.get(d);
      if (existing) {
        existing.expenses = exp;
      } else {
        byDate.set(d, {
          date: d,
          sales_count: 0,
          revenue: 0,
          expenses: exp,
        });
      }
    }

    const merged = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return c.json(merged);
  } catch (error) {
    console.error('Error fetching sales trends:', error);
    return c.json({ error: 'Failed to fetch sales trends' }, 500);
  }
});

// AI Action handler with enhanced natural language processing
api.post('/ai-action', async (c) => {
  try {
    const { message, context, conversationHistory } = await c.req.json();
    
    // Use the enhanced AI service
    const { aiService } = await import('./ai-service');
    
    // Set API key if available
    const apiKey = process.env.OPENAI_API_KEY || null;
    if (apiKey) {
      aiService.setApiKey(apiKey);
    }
    
    const response = await aiService.generateResponse(message, context, conversationHistory);
    
    // Check if action was requested
    const lowerMsg = message.toLowerCase();
    const isAction = lowerMsg.includes('update') || lowerMsg.includes('change') || 
                    lowerMsg.includes('add') || lowerMsg.includes('create') ||
                    lowerMsg.includes('set') || lowerMsg.includes('modify');
    
    if (isAction) {
      // Try to parse and execute action
      const { parseUserIntent, executeAction } = await import('./ai-action-handler');
      const intent = parseUserIntent(message, conversationHistory);
      
      if (intent.type === 'action') {
        try {
          const actionResult = await executeAction(intent, context, sql);
          return c.json({ 
            response: actionResult,
            refresh: intent.intent === 'create' || intent.intent === 'update'
          });
        } catch (error: any) {
          // If action fails, return the AI response
          return c.json({ response, refresh: false });
        }
      }
    }
    
    return c.json({ 
      response,
      refresh: false
    });
  } catch (error: any) {
    console.error('Error in AI action:', error);
    return c.json({ 
      response: `I encountered an error: ${error.message || 'Unknown error'}. Please try rephrasing your request.`
    }, 500);
  }
});

async function generateInsights(message: string, context: any, history: any[]): Promise<string> {
  const lowerMsg = message.toLowerCase();
  const analytics = context?.analytics || {};
  const sales = context?.sales || [];
  const products = context?.products || [];
  const expenses = context?.expenses || [];
  
  // Enhanced insight generation
  if (lowerMsg.includes('top') || lowerMsg.includes('best')) {
    if (lowerMsg.includes('product')) {
      return generateTopProductsInsight(products, sales);
    }
    if (lowerMsg.includes('selling')) {
      return generateTopSellingInsight(products, sales);
    }
  }
  
  if (lowerMsg.includes('low') && lowerMsg.includes('stock')) {
    const lowStock = products.filter((p: any) => p.stock_quantity <= p.min_stock_level);
    if (lowStock.length > 0) {
      return `📦 **Low Stock Alert:**\n\nYou have ${lowStock.length} products running low on stock:\n${lowStock.slice(0, 5).map((p: any) => `• ${p.name} - ${p.stock_quantity} units (min: ${p.min_stock_level})`).join('\n')}\n\nWould you like me to help you reorder these items?`;
    }
    return '✅ All your products are well stocked!';
  }
  
  if (lowerMsg.includes('profit') || lowerMsg.includes('margin')) {
    const margin = analytics.profit_margin || 0;
    return `📊 **Profit Analysis:**\n\n• Profit Margin: ${margin.toFixed(1)}%\n• Total Revenue: $${(analytics.revenue || 0).toFixed(2)}\n• Net Profit: $${(analytics.profit || 0).toFixed(2)}\n\n${margin > 30 ? 'Excellent! Your profit margin is very healthy.' : margin > 20 ? 'Good profit margin. Keep up the great work!' : 'Consider reviewing your pricing strategy to improve profitability.'}`;
  }
  
  if (lowerMsg.includes('today') || lowerMsg.includes('today\'s')) {
    return generateDailyInsight(analytics, sales);
  }
  
  // General insights
  return generateGeneralInsight(analytics, sales, products);
}

function generateTopProductsInsight(products: any[], sales: any[]): string {
  const insights: string[] = [];
  if (products.length > 0) {
    insights.push(`You currently have **${products.length} products** in stock.`);
    
    const categories = [...new Set(products.map(p => p.category))];
    if (categories.length > 0) {
      insights.push(`Categories: ${categories.join(', ')}`);
    }
  }
  
  insights.push('\n**Recommendations:**');
  insights.push('• Focus on your top-selling products');
  insights.push('• Ensure adequate stock for fast-moving items');
  insights.push('• Review and phase out slow-moving products');
  
  return insights.join('\n');
}

function generateTopSellingInsight(products: any[], sales: any[]): string {
  return `📈 **Sales Analysis:**\n\nBased on your recent data:\n• Total Products: ${products.length}\n• You can view your top-selling products in the Analytics dashboard.\n\nWould you like me to help you optimize your product mix?`;
}

function generateDailyInsight(analytics: any, sales: any[]): string {
  return `📅 **Today's Overview:**\n\n${sales.length > 0 ? `Recent activity with ${sales.length} sales recorded.` : 'No sales recorded today yet.'}\n\nRevenue: $${(analytics.revenue || 0).toFixed(2)}\nProfit: $${(analytics.profit || 0).toFixed(2)}`;
}

function generateGeneralInsight(analytics: any, sales: any[], products: any[]): string {
  return `💡 **Business Summary:**\n\n• Total Products: ${products.length}\n• Total Sales: ${analytics.sales_count || 0}\n• Revenue: $${(analytics.revenue || 0).toFixed(2)}\n• Profit Margin: ${(analytics.profit_margin || 0).toFixed(1)}%\n\nHow can I help you grow your business today?`;
}

api.get('/analytics/expense-breakdown', async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    
    let query = `
      SELECT 
        category,
        COUNT(*) as expense_count,
        SUM(amount) as total_amount
      FROM expenses
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND DATE(date) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(date) <= ?';
      params.push(endDate);
    }
    
    query += ' GROUP BY category ORDER BY total_amount DESC';
    
    const breakdown = await sql(query, params);
    return c.json(breakdown);
  } catch (error) {
    console.error('Error fetching expense breakdown:', error);
    return c.json({ error: 'Failed to fetch expense breakdown' }, 500);
  }
});

api.get('/analytics/sales-by-category', async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    
    let query = `
      SELECT 
        COALESCE(p.category, 'Uncategorized') as category,
        COUNT(DISTINCT s.id) as sale_count,
        SUM(si.total_price) as total_amount
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.payment_status = 'completed'
    `;
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND DATE(s.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(s.created_at) <= ?';
      params.push(endDate);
    }
    
    query += ' GROUP BY p.category ORDER BY total_amount DESC';
    
    const breakdown = await sql(query, params);
    return c.json(breakdown);
  } catch (error) {
    console.error('Error fetching sales by category:', error);
    return c.json({ error: 'Failed to fetch sales by category' }, 500);
  }
});

// Unified analytics detail per item (product/service) with date filter
// Unified filter-based analytics aggregation - handles all filter combinations
api.get('/analytics/filter-details', async (c) => {
  try {
    const { category, store, cashier, itemType, itemId, itemName, startDate, endDate, includeServices } = c.req.query();
    
    // Build WHERE conditions for PRODUCTS query dynamically based on filters
    let productConditions: string[] = ['s.payment_status = \'completed\'', 'si.product_id IS NOT NULL'];
    const productParams: any[] = [];
    
    // Category filter for products
    if (category) {
      productConditions.push('p.category = ?');
      productParams.push(category);
    }
    
    // Store filter (TODO: implement when store_id is added to sales table)
    if (store && store !== '') {
      // TODO: If sales table has store_id, uncomment:
      // productConditions.push('s.store_id = ?');
      // productParams.push(store);
    }
    
    // Cashier filter (TODO: implement when cashier is added to sales table)
    if (cashier && cashier !== '') {
      // TODO: If sales table has cashier field, uncomment:
      // productConditions.push('s.cashier = ?');
      // productParams.push(cashier);
    }
    
    // Item-specific filter for products
    if (itemType === 'product' && itemId) {
      productConditions.push('si.product_id = ?');
      productParams.push(itemId);
    }
    
    // Date filters for products
    if (startDate) {
      productConditions.push('DATE(s.created_at) >= ?');
      productParams.push(startDate);
    }
    if (endDate) {
      productConditions.push('DATE(s.created_at) <= ?');
      productParams.push(endDate);
    }
    
    const productWhereClause = productConditions.join(' AND ');
    
    // Build product aggregation query - aggregates ALL products matching filters
    const productAgg = await sql(`
      SELECT 
        COUNT(DISTINCT si.id) as sale_count,
        SUM(si.quantity) as total_quantity,
        SUM(si.total_price) as total_revenue,
        COUNT(DISTINCT si.product_id) as product_count
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      INNER JOIN products p ON si.product_id = p.id
      WHERE ${productWhereClause}
    `, productParams);
    
    // Aggregate services (if includeServices is true)
    let serviceAgg: any[] = [];
    let totalServiceRevenue = 0;
    let totalServiceQuantity = 0;
    
    if (includeServices === 'true' || includeServices === '1' || String(includeServices).toLowerCase() === 'true') {
      // Build WHERE conditions for SERVICES query dynamically based on filters
      let serviceConditions: string[] = ['s.payment_status = \'completed\'', 'si.service_id IS NOT NULL'];
      const serviceParams: any[] = [];
      
      // Category filter for services
      if (category) {
        serviceConditions.push('sv.category = ?');
        serviceParams.push(category);
      }
      
      // Store filter (TODO: implement when store_id is added to sales table)
      if (store && store !== '') {
        // TODO: If sales table has store_id, uncomment:
        // serviceConditions.push('s.store_id = ?');
        // serviceParams.push(store);
      }
      
      // Cashier filter (TODO: implement when cashier is added to sales table)
      if (cashier && cashier !== '') {
        // TODO: If sales table has cashier field, uncomment:
        // serviceConditions.push('s.cashier = ?');
        // serviceParams.push(cashier);
      }
      
      // Item-specific filter for services
      if (itemType === 'service' && itemName) {
        serviceConditions.push('sv.name = ?');
        serviceParams.push(itemName);
      }
      
      // Date filters for services
      if (startDate) {
        serviceConditions.push('DATE(s.created_at) >= ?');
        serviceParams.push(startDate);
      }
      if (endDate) {
        serviceConditions.push('DATE(s.created_at) <= ?');
        serviceParams.push(endDate);
      }
      
      const serviceWhereClause = serviceConditions.join(' AND ');
      
      // Build service aggregation query - aggregates ALL services matching filters
      serviceAgg = await sql(`
        SELECT 
          COUNT(DISTINCT si.id) as sale_count,
          SUM(si.quantity) as total_quantity,
          SUM(si.total_price) as total_revenue,
          COUNT(DISTINCT si.service_id) as service_count
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN services sv ON si.service_id = sv.id
        WHERE ${serviceWhereClause}
      `, serviceParams);
      
      if (serviceAgg && serviceAgg[0]) {
        totalServiceRevenue = parseFloat(serviceAgg[0]?.total_revenue || 0);
        totalServiceQuantity = parseFloat(serviceAgg[0]?.total_quantity || 0);
      }
    }
    
    // Calculate COGS for products (using same conditions as product aggregation)
    let totalCOGS = 0;
    try {
      const productCostQuery = await sql(`
        SELECT SUM(COALESCE(si.cogs_amount, COALESCE(p.cost_price, 0) * si.quantity)) as total_cogs
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN products p ON si.product_id = p.id
        WHERE ${productWhereClause}
      `, productParams);
      totalCOGS = parseFloat(productCostQuery[0]?.total_cogs || 0);
    } catch (err) {
      // cost_price column might not exist, set COGS to 0
      totalCOGS = 0;
    }
    
    const totalRevenue = parseFloat(productAgg[0]?.total_revenue || 0) + totalServiceRevenue;
    const totalQuantity = parseFloat(productAgg[0]?.total_quantity || 0) + totalServiceQuantity;
    const totalProfit = totalRevenue - totalCOGS;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    // Get trends data - combine products and services with proper filtering
    const trendsConditions: string[] = ['s.payment_status = \'completed\''];
    const trendsParams: any[] = [];
    
    // Category filter (for both products and services)
    if (category) {
      trendsConditions.push('((si.product_id IS NOT NULL AND p.category = ?) OR (si.service_id IS NOT NULL AND sv.category = ?))');
      trendsParams.push(category, category);
    }
    
    // Store and cashier filters (TODO: implement when these fields are added to sales table)
    // if (store && store !== '') {
    //   trendsConditions.push('s.store_id = ?');
    //   trendsParams.push(store);
    // }
    // if (cashier && cashier !== '') {
    //   trendsConditions.push('s.cashier = ?');
    //   trendsParams.push(cashier);
    // }
    
    // Item-specific filter
    if (itemType === 'product' && itemId) {
      trendsConditions.push('si.product_id = ?');
      trendsParams.push(itemId);
    } else if (itemType === 'service' && itemName) {
      trendsConditions.push('sv.name = ?');
      trendsParams.push(itemName);
    }
    
    // Include services filter
    if (includeServices !== 'true' && includeServices !== '1' && String(includeServices).toLowerCase() !== 'true') {
      trendsConditions.push('si.product_id IS NOT NULL');
    }
    
    // Date filters
    if (startDate) {
      trendsConditions.push('DATE(s.created_at) >= ?');
      trendsParams.push(startDate);
    }
    if (endDate) {
      trendsConditions.push('DATE(s.created_at) <= ?');
      trendsParams.push(endDate);
    }
    
    const trendsWhereClause = trendsConditions.join(' AND ');
    
    const trendsData = await sql(`
      SELECT 
        DATE(s.created_at) as date,
        SUM(si.quantity) as quantity,
        SUM(si.total_price) as revenue
      FROM sale_items si
      INNER JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN services sv ON si.service_id = sv.id
      WHERE ${trendsWhereClause}
      GROUP BY DATE(s.created_at)
      ORDER BY date ASC
    `, trendsParams);
    
    // Build meta based on filters FIRST (needed for topProducts logic)
    let metaName = '';
    let metaType = 'aggregated';
    let metaCategory: string | null = null;
    let metaSku: string | null = null;
    
    if (itemType === 'product' && itemId) {
      const item = await sql('SELECT * FROM products WHERE id = ?', [itemId]);
      metaName = item[0]?.name || 'Product';
      metaType = 'product';
      metaCategory = item[0]?.category || null;
      metaSku = item[0]?.barcode || null; // Use barcode as SKU
    } else if (itemType === 'service' && itemName) {
      // Fetch service category
      const service = await sql('SELECT * FROM services WHERE name = ?', [itemName]);
      metaName = itemName;
      metaType = 'service';
      metaCategory = service[0]?.category || null;
      metaSku = null; // Services don't have SKU/barcode
    } else if (category) {
      metaName = `${category} Category`;
      if (store) metaName += ` - ${store} Store`;
      if (cashier) metaName += ` - ${cashier}`;
      metaType = 'category';
      metaCategory = category;
    } else if (store) {
      metaName = `${store} Store`;
      metaType = 'aggregated';
    } else if (cashier) {
      metaName = `${cashier} - All Items`;
      metaType = 'aggregated';
    } else {
      metaName = 'All Items';
      metaType = 'aggregated';
    }
    
    // Get top products when viewing category or aggregated view (not individual item)
    let topProducts: any[] = [];
    if ((metaType === 'category' || metaType === 'aggregated') && !itemType) {
      const topProductsConditions: string[] = ['s.payment_status = \'completed\'', 'si.product_id IS NOT NULL'];
      const topProductsParams: any[] = [];
      
      if (category) {
        topProductsConditions.push('p.category = ?');
        topProductsParams.push(category);
      }
      
      if (startDate) {
        topProductsConditions.push('DATE(s.created_at) >= ?');
        topProductsParams.push(startDate);
      }
      if (endDate) {
        topProductsConditions.push('DATE(s.created_at) <= ?');
        topProductsParams.push(endDate);
      }
      
      const topProductsWhere = topProductsConditions.join(' AND ');
      
      topProducts = await sql(`
        SELECT 
          p.id,
          p.name,
          SUM(si.quantity) as total_quantity,
          SUM(si.total_price) as total_revenue,
          COUNT(DISTINCT si.id) as sale_count
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN products p ON si.product_id = p.id
        WHERE ${topProductsWhere}
        GROUP BY p.id, p.name
        ORDER BY total_revenue DESC
        LIMIT 10
      `, topProductsParams);
    }
    
    // Get recent transactions when viewing individual items
    let transactions: any[] = [];
    if (itemType === 'product' && itemId) {
      const transactionParams: any[] = [itemId];
      let transactionWhere = 'si.product_id = ? AND s.payment_status = \'completed\'';
      if (startDate) {
        transactionWhere += ' AND DATE(s.created_at) >= ?';
        transactionParams.push(startDate);
      }
      if (endDate) {
        transactionWhere += ' AND DATE(s.created_at) <= ?';
        transactionParams.push(endDate);
      }
      
      transactions = await sql(`
        SELECT 
          DATE(s.created_at) as date,
          SUM(si.quantity) as quantity,
          SUM(si.total_price) as amount
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        WHERE ${transactionWhere}
        GROUP BY DATE(s.created_at)
        ORDER BY date DESC
        LIMIT 20
      `, transactionParams);
    } else if (itemType === 'service' && itemName) {
      const transactionParams: any[] = [itemName];
      let transactionWhere = 'sv.name = ? AND s.payment_status = \'completed\'';
      if (startDate) {
        transactionWhere += ' AND DATE(s.created_at) >= ?';
        transactionParams.push(startDate);
      }
      if (endDate) {
        transactionWhere += ' AND DATE(s.created_at) <= ?';
        transactionParams.push(endDate);
      }
      
      transactions = await sql(`
        SELECT 
          DATE(s.created_at) as date,
          SUM(si.quantity) as quantity,
          SUM(si.total_price) as amount
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN services sv ON si.service_id = sv.id
        WHERE ${transactionWhere}
        GROUP BY DATE(s.created_at)
        ORDER BY date DESC
        LIMIT 20
      `, transactionParams);
    }
    
    // Calculate additional metrics for individual products
    let bestDay: string | null = null;
    let peakRevenue = 0;
    let revenueTrend: 'up' | 'down' | 'stable' = 'stable';
    
    if (itemType === 'product' && itemId && trendsData.length > 0) {
      // Find best day (highest revenue)
      const bestDayData = trendsData.reduce((max, day) => {
        const dayRevenue = parseFloat(day.revenue || 0);
        const maxRevenue = parseFloat(max.revenue || 0);
        return dayRevenue > maxRevenue ? day : max;
      }, trendsData[0]);
      bestDay = bestDayData?.date || null;
      peakRevenue = parseFloat(bestDayData?.revenue || 0);
      
      // Calculate revenue trend (compare first half vs second half)
      if (trendsData.length > 1) {
        const midpoint = Math.floor(trendsData.length / 2);
        const firstHalf = trendsData.slice(0, midpoint);
        const secondHalf = trendsData.slice(midpoint);
        
        const firstHalfAvg = firstHalf.reduce((sum, day) => sum + parseFloat(day.revenue || 0), 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, day) => sum + parseFloat(day.revenue || 0), 0) / secondHalf.length;
        
        const difference = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
        
        if (Math.abs(difference) < 5) {
          revenueTrend = 'stable';
        } else if (difference > 0) {
          revenueTrend = 'up';
        } else {
          revenueTrend = 'down';
        }
      }
    }
    
    // Calculate returns - count sale_items that were returned
    // Note: Currently no returns table exists, so we count failed sales as a proxy
    // In a proper system, returns would be tracked in a separate returns table
    // showing items from completed sales that were later returned
    let totalReturns = 0;
    try {
      // Check if returns table exists
      const returnsTableCheck = await sql(`
        SELECT COUNT(*) as table_exists
        FROM sqlite_master
        WHERE type='table' AND name='returns'
      `);
      
      if (returnsTableCheck && returnsTableCheck[0]?.table_exists > 0) {
        // If returns table exists, query it properly
        // This would be the proper way: query returns table with filters
        const returnsConditions: string[] = [];
        const returnsParams: any[] = [];
        
        // Apply same filters as sales queries
        if (category) {
          returnsConditions.push('((r.product_id IS NOT NULL AND p.category = ?) OR (r.service_id IS NOT NULL AND sv.category = ?))');
          returnsParams.push(category, category);
        }
        
        if (itemType === 'product' && itemId) {
          returnsConditions.push('r.product_id = ?');
          returnsParams.push(itemId);
        } else if (itemType === 'service' && itemName) {
          returnsConditions.push('sv.name = ?');
          returnsParams.push(itemName);
        }
        
        if (startDate) {
          returnsConditions.push('DATE(r.return_date) >= ?');
          returnsParams.push(startDate);
        }
        if (endDate) {
          returnsConditions.push('DATE(r.return_date) <= ?');
          returnsParams.push(endDate);
        }
        
        // Always ensure returns are from completed sales
        returnsConditions.push('s.payment_status = \'completed\'');
        
        const returnsWhere = returnsConditions.length > 0 
          ? 'WHERE ' + returnsConditions.join(' AND ')
          : '';
        
        // Join with sales to ensure we only count returns from completed sales
        const returnsQuery = await sql(`
          SELECT COALESCE(SUM(r.quantity), 0) as total_returned_items
          FROM returns r
          LEFT JOIN products p ON r.product_id = p.id
          LEFT JOIN services sv ON r.service_id = sv.id
          INNER JOIN sales s ON r.sale_id = s.id
          ${returnsWhere}
        `, returnsParams);
        
        totalReturns = parseFloat(returnsQuery[0]?.total_returned_items || 0);
      } else {
        // No returns table - returns tracking not implemented
        // Returns should show 0 until returns tracking is properly implemented
        // Note: Failed sales (payment_status='failed') are NOT returns
        // Returns are completed sales that were later returned by customers
        totalReturns = 0;
      }
    } catch (err) {
      // Returns table doesn't exist yet, default to 0
      totalReturns = 0;
    }
    
    return c.json({
      meta: {
        name: metaName,
        category: metaCategory || category || null,
        type: metaType,
        sku: metaSku,
        product_count: productAgg[0]?.product_count || 0,
        service_count: serviceAgg[0]?.service_count || 0,
        store: store || null,
        cashier: cashier || null
      },
      stats: {
        total_sales: (productAgg[0]?.sale_count || 0) + (serviceAgg[0]?.sale_count || 0),
        total_quantity: totalQuantity,
        total_revenue: totalRevenue,
        total_expenses: totalCOGS,
        profit: totalProfit,
        profit_margin: profitMargin,
        total_returns: totalReturns
      },
      trends: trendsData || [],
      topProducts: topProducts || [],
      transactions: transactions || [],
      bestDay: bestDay,
      peakRevenue: peakRevenue,
      revenueTrend: revenueTrend
    });
  } catch (error) {
    console.error('Error fetching filter details analytics:', error);
    return c.json({ error: 'Failed to fetch filter details analytics' }, 500);
  }
});

// Returns API endpoints
api.get('/returns', async (c) => {
  try {
    const { saleId, productId, serviceId, startDate, endDate } = c.req.query();
    let query = `
      SELECT r.*, 
        p.name as product_name,
        sv.name as service_name,
        s.id as sale_number,
        s.total_amount as original_sale_amount
      FROM returns r
      LEFT JOIN products p ON r.product_id = p.id
      LEFT JOIN services sv ON r.service_id = sv.id
      INNER JOIN sales s ON r.sale_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (saleId) {
      query += ' AND r.sale_id = ?';
      params.push(saleId);
    }
    if (productId) {
      query += ' AND r.product_id = ?';
      params.push(productId);
    }
    if (serviceId) {
      query += ' AND r.service_id = ?';
      params.push(serviceId);
    }
    if (startDate) {
      query += ' AND DATE(r.return_date) >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND DATE(r.return_date) <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY r.return_date DESC';
    
    const returns = await sql(query, params);
    return c.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    return c.json({ error: 'Failed to fetch returns' }, 500);
  }
});

api.post('/returns', async (c) => {
  try {
    const token = c.get('posSessionToken');
    const session = getSession(token);

    const { saleId, saleItemId, productId, serviceId, quantity, returnReason, returnAmount, notes } = await c.req.json();
    
    // Validate required fields
    if (!saleId || !saleItemId || !quantity || quantity <= 0) {
      return c.json({ error: 'Sale ID, sale item ID, and valid quantity are required' }, 400);
    }
    
    // Verify the sale item exists and belongs to the sale
    const saleItem = await sql('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [saleItemId, saleId]);
    if (!saleItem || saleItem.length === 0) {
      return c.json({ error: 'Sale item not found or does not belong to the specified sale' }, 404);
    }
    
    const item = saleItem[0];
    
    // Verify quantity doesn't exceed what was sold
    if (quantity > item.quantity) {
      return c.json({ error: `Cannot return more than what was sold (${item.quantity} units)` }, 400);
    }
    
    // Check if sale is completed (only completed sales can have returns)
    const sale = await sql('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (!sale || sale.length === 0) {
      return c.json({ error: 'Sale not found' }, 404);
    }
    
    if (sale[0].payment_status !== 'completed') {
      return c.json({ error: 'Only completed sales can have returns' }, 400);
    }
    
    // Calculate return amount if not provided
    let calculatedReturnAmount = returnAmount;
    if (!calculatedReturnAmount) {
      // Use the unit price from the sale item
      calculatedReturnAmount = item.unit_price * quantity;
    }
    
    // Check if this item is already partially or fully returned
    const existingReturns = await sql('SELECT SUM(quantity) as total_returned FROM returns WHERE sale_item_id = ?', [saleItemId]);
    const alreadyReturned = parseFloat(existingReturns[0]?.total_returned || 0);
    
    if (alreadyReturned + quantity > item.quantity) {
      return c.json({ 
        error: `Cannot return ${quantity} units. Only ${item.quantity - alreadyReturned} units remain unreturned from this sale item.` 
      }, 400);
    }
    
    // Use database transaction to ensure atomicity
    const result = await db.transaction(() => {
      // Create return record
      const returnResult = sql(`
        INSERT INTO returns (
          sale_id, sale_item_id, product_id, service_id, quantity, 
          return_reason, return_amount, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        saleId, saleItemId, item.product_id || null, item.service_id || null,
        quantity, returnReason || null, calculatedReturnAmount, notes || null
      ]);
      
      const returnId = returnResult.lastInsertRowid;
      
      // If it's a product return, restore stock
      if (item.product_id) {
        sql(`
          UPDATE products 
          SET stock_quantity = stock_quantity + ?
          WHERE id = ?
        `, [quantity, item.product_id]);
      }
      
      return returnId;
    });
    
    // Fetch the created return with details
    const createdReturn = await sql(`
      SELECT r.*, 
        p.name as product_name,
        sv.name as service_name,
        s.id as sale_number
      FROM returns r
      LEFT JOIN products p ON r.product_id = p.id
      LEFT JOIN services sv ON r.service_id = sv.id
      INNER JOIN sales s ON r.sale_id = s.id
      WHERE r.id = ?
    `, [result]);

    // Log activity after return is created
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      const itemName = createdReturn[0]?.product_name || createdReturn[0]?.service_name || 'Item';
      
      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'sale_return',
        result,
        'return',
        JSON.stringify({ 
          sale_id: saleId, 
          sale_item_id: saleItemId,
          item_name: itemName,
          quantity,
          return_amount: calculatedReturnAmount,
          return_reason: returnReason
        }),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }
    
    return c.json(createdReturn[0]);
  } catch (error: any) {
    console.error('Error creating return:', error);
    return c.json({ error: error.message || 'Failed to create return' }, 500);
  }
});

api.get('/analytics/item-details', async (c) => {
  try {
    const { type, id, name, startDate, endDate } = c.req.query();
    let meta = {};
    let trends = [];
    let stats = {
      total_sales: 0,
      total_quantity: 0,
      total_revenue: 0,
      total_expenses: 0,
      profit: 0,
      profit_margin: 0
    };
    if (type === 'product' && id) {
      // Product details
      meta = (await sql('SELECT * FROM products WHERE id = ?', [id]))[0] || {};
      // Sales trend
      const trendRows = await sql(`
        SELECT DATE(s.created_at) as date, SUM(si.quantity) as quantity, SUM(si.total_price) as revenue
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        WHERE si.product_id = ?
        ${startDate ? 'AND DATE(s.created_at) >= ?' : ''}
        ${endDate ? 'AND DATE(s.created_at) <= ?' : ''}
        GROUP BY DATE(s.created_at) ORDER BY date ASC
      `, [id].concat(startDate ? [startDate] : []).concat(endDate ? [endDate] : []));
      trends = trendRows;
      // Aggregate
      const agg = await sql(`
        SELECT COUNT(si.id) as sale_count, SUM(si.quantity) as total_quantity, SUM(si.total_price) as total_revenue
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        WHERE si.product_id = ?
        ${startDate ? 'AND DATE(s.created_at) >= ?' : ''}
        ${endDate ? 'AND DATE(s.created_at) <= ?' : ''}
      `, [id].concat(startDate ? [startDate] : []).concat(endDate ? [endDate] : []));
      stats.total_sales = agg[0]?.sale_count || 0;
      stats.total_quantity = agg[0]?.total_quantity || 0;
      stats.total_revenue = parseFloat(agg[0]?.total_revenue || 0);
      const cost = ((meta as any).cost_price || 0) * stats.total_quantity;
      stats.total_expenses = cost;
      stats.profit = stats.total_revenue - cost;
      stats.profit_margin = stats.total_revenue ? (stats.profit / stats.total_revenue) * 100 : 0;
    } else if (type === 'service' && name) {
      meta = (await sql('SELECT * FROM services WHERE name = ?', [name]))[0] || { name };
      // Sales trend
      const trendRows = await sql(`
        SELECT DATE(s.created_at) as date, SUM(si.quantity) as quantity, SUM(si.total_price) as revenue
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN services sv ON si.service_id = sv.id
        WHERE sv.name = ?
        ${startDate ? 'AND DATE(s.created_at) >= ?' : ''}
        ${endDate ? 'AND DATE(s.created_at) <= ?' : ''}
        GROUP BY DATE(s.created_at) ORDER BY date ASC
      `, [name].concat(startDate ? [startDate] : []).concat(endDate ? [endDate] : []));
      trends = trendRows;
      // Aggregate
      const agg = await sql(`
        SELECT COUNT(si.id) as sale_count, SUM(si.quantity) as total_quantity, SUM(si.total_price) as total_revenue
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        INNER JOIN services sv ON si.service_id = sv.id
        WHERE sv.name = ?
        ${startDate ? 'AND DATE(s.created_at) >= ?' : ''}
        ${endDate ? 'AND DATE(s.created_at) <= ?' : ''}
      `, [name].concat(startDate ? [startDate] : []).concat(endDate ? [endDate] : []));
      stats.total_sales = agg[0]?.sale_count || 0;
      stats.total_quantity = agg[0]?.total_quantity || 0;
      stats.total_revenue = parseFloat(agg[0]?.total_revenue || 0);
      stats.total_expenses = 0; // For services, expenses unknown
      stats.profit = stats.total_revenue;
      stats.profit_margin = 100;
    } else {
      return c.json({ error: 'Missing or invalid item type (product/service) and id/name' }, 400);
    }
    return c.json({ meta, stats, trends });
  } catch (error) {
    console.error('Error fetching item details analytics:', error);
    return c.json({ error: 'Failed to fetch item details analytics' }, 500);
  }
});

// Auth routes - Helper functions
async function hashPassword(password: string): Promise<string> {
  return await hash(password);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch (error) {
    return false;
  }
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const BOOTSTRAP_PRODUCT_ID = 'dreamnet-pos';
const BOOTSTRAP_STATUS_KEY = 'bootstrap_activation_status';
const DEPLOYMENT_MODE_FILE = 'deployment_mode.json';

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function readBootstrapStatus(): {
  activated: boolean;
  machineId: string;
  activatedAt: string;
  keyId: string;
} {
  try {
    ensureAppSettingsTable();
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(BOOTSTRAP_STATUS_KEY) as { value: string } | undefined;
    if (!row?.value) {
      return { activated: false, machineId: '', activatedAt: '', keyId: '' };
    }
    const parsed = JSON.parse(row.value || '{}');
    return {
      activated: Boolean(parsed?.activated),
      machineId: String(parsed?.machineId || ''),
      activatedAt: String(parsed?.activatedAt || ''),
      keyId: String(parsed?.keyId || ''),
    };
  } catch {
    return { activated: false, machineId: '', activatedAt: '', keyId: '' };
  }
}

function writeBootstrapStatus(status: {
  activated: boolean;
  machineId: string;
  activatedAt: string;
  keyId?: string;
}) {
  ensureAppSettingsTable();
  const value = JSON.stringify({
    activated: Boolean(status.activated),
    machineId: String(status.machineId || ''),
    activatedAt: String(status.activatedAt || ''),
    keyId: String(status.keyId || ''),
  });
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(BOOTSTRAP_STATUS_KEY, value);
}

function readPersistedDeploymentMode(): 'server' | 'client' | '' {
  try {
    const dataDir = process.env.DREAMNET_DATA_DIR?.trim();
    if (!dataDir) return '';
    const fp = path.join(dataDir, DEPLOYMENT_MODE_FILE);
    if (!existsSync(fp)) return '';
    const raw = readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw || '{}') as { mode?: string };
    const mode = String(parsed?.mode || '').trim().toLowerCase();
    if (mode === 'server' || mode === 'client') return mode;
    return '';
  } catch {
    return '';
  }
}

async function writePersistedDeploymentMode(mode: string): Promise<void> {
  const m = String(mode || '').trim().toLowerCase();
  if (m !== 'server' && m !== 'client') return;
  const dataDir = process.env.DREAMNET_DATA_DIR?.trim();
  if (!dataDir) return;
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, DEPLOYMENT_MODE_FILE), JSON.stringify({ mode: m }, null, 2), 'utf8');
}

function getActiveSuperAdminCount(): number {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND is_active = 1`)
      .get() as { count: number } | undefined;
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

function verifyBootstrapResponse(requestCode: string, responseToken: string) {
  const requestJson = base64UrlDecode(String(requestCode || '').trim());
  const req = JSON.parse(requestJson || '{}') as {
    machine_id?: string;
    nonce?: string;
    product_id?: string;
  };
  const [payloadPart, sigPart] = String(responseToken || '').trim().split('.');
  if (!payloadPart || !sigPart) {
    throw new Error('Invalid response token format');
  }
  const payloadJson = base64UrlDecode(payloadPart);
  const payload = JSON.parse(payloadJson || '{}') as {
    machine_id?: string;
    request_nonce?: string;
    product_id?: string;
    allow_install?: boolean;
    expires_at?: number | null;
    key_id?: string;
  };
  const signature = Buffer.from(sigPart, 'base64url');
  const pubRaw = process.env.BOOTSTRAP_PUBLIC_KEY_PEM || process.env.APP_BOOTSTRAP_PUBLIC_KEY_PEM;
  const pub = String(pubRaw || '').replace(/\\n/g, '\n').trim();
  if (!pub) {
    throw new Error('Bootstrap public key is not configured');
  }
  const isValid = crypto.verify(
    null,
    Buffer.from(payloadPart, 'utf8'),
    crypto.createPublicKey(pub),
    signature
  );
  if (!isValid) throw new Error('Invalid signature');
  if (String(payload.product_id || '') !== BOOTSTRAP_PRODUCT_ID) throw new Error('Invalid product');
  if (String(req.product_id || '') !== BOOTSTRAP_PRODUCT_ID) throw new Error('Invalid request product');
  if (String(payload.machine_id || '') !== String(req.machine_id || '')) throw new Error('Machine mismatch');
  if (String(payload.request_nonce || '') !== String(req.nonce || '')) throw new Error('Nonce mismatch');
  if (payload.allow_install !== true) throw new Error('Install not allowed in response token');
  if (payload.expires_at != null) {
    const exp = Number(payload.expires_at);
    if (Number.isFinite(exp) && Date.now() > exp * 1000) {
      throw new Error('Response token expired');
    }
  }
  return {
    machineId: String(payload.machine_id || ''),
    keyId: String(payload.key_id || ''),
  };
}

/** Developer-signed token (same format as bootstrap activate) to reset a locked-out super admin password. */
function verifySuperadminPasswordResetResponse(requestCode: string, responseToken: string) {
  const requestJson = base64UrlDecode(String(requestCode || '').trim());
  const req = JSON.parse(requestJson || '{}') as {
    machine_id?: string;
    nonce?: string;
    product_id?: string;
    purpose?: string;
  };
  if (String(req.purpose || '') !== 'superadmin_password_reset') {
    throw new Error('Invalid request purpose');
  }
  const [payloadPart, sigPart] = String(responseToken || '').trim().split('.');
  if (!payloadPart || !sigPart) {
    throw new Error('Invalid response token format');
  }
  const payloadJson = base64UrlDecode(payloadPart);
  const payload = JSON.parse(payloadJson || '{}') as {
    machine_id?: string;
    request_nonce?: string;
    product_id?: string;
    allow_superadmin_password_reset?: boolean;
    expires_at?: number | null;
    key_id?: string;
    target_username?: string;
  };
  const signature = Buffer.from(sigPart, 'base64url');
  const pubRaw = process.env.BOOTSTRAP_PUBLIC_KEY_PEM || process.env.APP_BOOTSTRAP_PUBLIC_KEY_PEM;
  const pub = String(pubRaw || '').replace(/\\n/g, '\n').trim();
  if (!pub) {
    throw new Error('Bootstrap public key is not configured');
  }
  const isValid = crypto.verify(
    null,
    Buffer.from(payloadPart, 'utf8'),
    crypto.createPublicKey(pub),
    signature
  );
  if (!isValid) throw new Error('Invalid signature');
  if (String(payload.product_id || '') !== BOOTSTRAP_PRODUCT_ID) throw new Error('Invalid product');
  if (String(req.product_id || '') !== BOOTSTRAP_PRODUCT_ID) throw new Error('Invalid request product');
  if (String(payload.machine_id || '') !== String(req.machine_id || '')) throw new Error('Machine mismatch');
  if (String(payload.request_nonce || '') !== String(req.nonce || '')) throw new Error('Nonce mismatch');
  if (payload.allow_superadmin_password_reset !== true) {
    throw new Error('Super admin password reset not allowed in token');
  }
  if (payload.expires_at != null) {
    const exp = Number(payload.expires_at);
    if (Number.isFinite(exp) && Date.now() > exp * 1000) {
      throw new Error('Response token expired');
    }
  }
  return {
    machineId: String(payload.machine_id || ''),
    keyId: String(payload.key_id || ''),
    targetUsername: String(payload.target_username || '').trim(),
  };
}

async function createSession(userId: number, storeId: number | null = null) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  db.prepare(`
    INSERT INTO sessions (user_id, store_id, session_token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, storeId, token, expiresAt.toISOString());

  return { token, expiresAt };
}

const SHIFT_AUTO_LOGOUT_GRACE_MS = 30 * 1000;
const SHIFT_EXTENSION_MS = 10 * 60 * 1000;
const SHIFT_MAX_EXTENSION_MS = 6 * 60 * 60 * 1000; // cap total extension time per session to 6 hours
const shiftExtensionByToken = new Map<string, number>();

function parseWorkShiftWindow(workShiftRaw: unknown, now = new Date()) {
  const raw = String(workShiftRaw || '').trim();
  if (!raw) return { hasShift: false, isInShift: true } as const;

  let start = '';
  let end = '';
  try {
    const parsed = JSON.parse(raw) as { start?: string; end?: string };
    start = String(parsed?.start || '').trim();
    end = String(parsed?.end || '').trim();
  } catch {
    const match = raw.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/);
    if (match) {
      start = match[1];
      end = match[2];
    }
  }
  if (!start || !end) return { hasShift: false, isInShift: true } as const;

  const [sh, sm] = start.split(':').map((v) => Number(v));
  const [eh, em] = end.split(':').map((v) => Number(v));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return { hasShift: false, isInShift: true } as const;
  }

  const startToday = new Date(now);
  startToday.setHours(sh, sm, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(eh, em, 0, 0);

  let startAt = startToday;
  let endAt = endToday;
  if (endAt <= startAt) {
    if (now >= startToday) {
      endAt = new Date(endToday.getTime() + 24 * 60 * 60 * 1000);
    } else {
      startAt = new Date(startToday.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  const isInShift = now >= startAt && now <= endAt;
  const nextStartAt = now < startAt ? startAt : new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
  return { hasShift: true, isInShift, startAt, endAt, nextStartAt } as const;
}

function getSession(token: string) {
  if (!token) return null;
  
  const session: any = db.prepare(`
    SELECT s.*, u.username, u.email, u.full_name, u.role, u.work_shift, u.is_active as user_active,
           st.name as store_name, st.id as store_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN stores st ON s.store_id = st.id
    WHERE s.session_token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) {
    return null;
  }

  // Check if user is active (SQLite returns 1 for true, 0 for false)
  if (session.user_active !== 1 && session.user_active !== true) {
    return null;
  }

  const shift = parseWorkShiftWindow(session.work_shift, new Date());
  if (shift.hasShift && !shift.isInShift) {
    const endAtMs = shift.endAt.getTime();
    const extension = Math.min(shiftExtensionByToken.get(token) || 0, SHIFT_MAX_EXTENSION_MS);
    const hardLogoutAt = endAtMs + SHIFT_AUTO_LOGOUT_GRACE_MS + extension;
    if (Date.now() > hardLogoutAt) {
      shiftExtensionByToken.delete(token);
      deleteSession(token);
      return null;
    }
  }

  return {
    id: session.id,
    userId: session.user_id,
    storeId: session.store_id,
    storeName: session.store_name,
    username: session.username,
    email: session.email,
    fullName: session.full_name,
    role: session.role,
    workShift: session.work_shift || null,
    expiresAt: session.expires_at,
  };
}

function deleteSession(token: string) {
  shiftExtensionByToken.delete(token);
  db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
}

function getUserByUsernameOrEmail(identifier: string) {
  return db.prepare(`
    SELECT id, username, email, password_hash, full_name, role, work_shift, is_active
    FROM users
    WHERE (username = ? OR email = ?) AND is_active = 1
  `).get(identifier, identifier) as any;
}

function getUserStores(userId: number) {
  return db.prepare(`
    SELECT s.*, us.is_primary
    FROM stores s
    JOIN user_stores us ON s.id = us.store_id
    WHERE us.user_id = ? AND s.is_active = 1
    ORDER BY us.is_primary DESC, s.name ASC
  `).all(userId) as any[];
}

/** One-shot UI notice when the embedded server had to move off a persisted port (consumed on read). */
api.get('/bootstrap/port-reassign-notice', (c) => {
  try {
    const dir = process.env.DREAMNET_DATA_DIR?.trim();
    if (!dir) return c.json({ notice: null });
    const fp = path.join(dir, 'port_reassign_notice.json');
    if (!existsSync(fp)) return c.json({ notice: null });
    const raw = readFileSync(fp, 'utf8');
    try {
      unlinkSync(fp);
    } catch {
      /* still return payload */
    }
    const j = JSON.parse(raw) as { previousPort?: number; newPort?: number; at?: string };
    if (j == null || typeof j !== 'object') return c.json({ notice: null });
    return c.json({ notice: j });
  } catch {
    return c.json({ notice: null });
  }
});

api.get('/bootstrap/status', (c) => {
  const status = readBootstrapStatus();
  const hasSuperAdmin = getActiveSuperAdminCount() > 0;
  return c.json({
    activated: status.activated,
    machineId: status.machineId,
    activatedAt: status.activatedAt,
    keyId: status.keyId,
    hasSuperAdmin,
    requiresBootstrap: !status.activated,
    requiresSuperAdminSetup: status.activated && !hasSuperAdmin,
  });
});

api.get('/bootstrap/deployment-mode', (c) => {
  const mode = readPersistedDeploymentMode();
  return c.json({ mode: mode || null });
});

api.post('/bootstrap/deployment-mode', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const mode = String(body?.mode || '').trim().toLowerCase();
    if (mode !== 'server' && mode !== 'client') {
      return c.json({ error: 'mode must be server or client' }, 400);
    }
    await writePersistedDeploymentMode(mode);
    return c.json({ success: true, mode });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to save deployment mode' }, 500);
  }
});

api.post('/bootstrap/request', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const machineId = String(body?.machine_id || body?.machineId || '').trim();
    const installerVersion = String(body?.installer_version || body?.installerVersion || '0.1.0').trim();
    if (!machineId) return c.json({ error: 'machine_id is required' }, 400);
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = {
      machine_id: machineId,
      product_id: BOOTSTRAP_PRODUCT_ID,
      installer_version: installerVersion,
      issued_at: Math.floor(Date.now() / 1000),
      nonce,
    };
    const requestCode = base64UrlEncode(JSON.stringify(payload));
    return c.json({ requestCode, requestPayload: payload });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to generate request code' }, 500);
  }
});

api.post('/bootstrap/activate', async (c) => {
  try {
    const current = readBootstrapStatus();
    if (current.activated) {
      return c.json({ success: true, activated: true, alreadyActivated: true });
    }
    const body = await c.req.json();
    const requestCode = String(body?.requestCode || '').trim();
    const responseToken = String(body?.responseToken || '').trim();
    if (!requestCode || !responseToken) {
      return c.json({ error: 'requestCode and responseToken are required' }, 400);
    }
    const verified = verifyBootstrapResponse(requestCode, responseToken);
    writeBootstrapStatus({
      activated: true,
      machineId: verified.machineId,
      activatedAt: new Date().toISOString(),
      keyId: verified.keyId,
    });
    return c.json({ success: true, activated: true });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Activation failed' }, 400);
  }
});

const SUPER_ADMIN_DEFAULT_PERMISSIONS = [
  'access_pos',
  'edit_products',
  'edit_services',
  'manage_sales',
  'manage_inventory',
  'view_analytics',
  'manage_expenses',
  'manage_users',
  'manage_employees',
  'manage_stores',
  'edit_prices',
  'access_admin',
  'manage_themes',
  'view_alerts',
  'view_activity_log',
];

api.post('/bootstrap/create-superadmin', async (c) => {
  try {
    const status = readBootstrapStatus();
    if (!status.activated) return c.json({ error: 'Bootstrap activation required' }, 403);
    if (getActiveSuperAdminCount() > 0) return c.json({ error: 'Super admin already exists' }, 409);
    const body = await c.req.json();
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');
    const fullName = String(body?.fullName || body?.full_name || '').trim() || 'Super Admin';
    if (!username || username.length < 3) return c.json({ error: 'Username must be at least 3 characters' }, 400);
    if (!password || password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return c.json({ error: 'Username already exists' }, 409);
    const passwordHash = await hashPassword(password);
    const permsJson = JSON.stringify(SUPER_ADMIN_DEFAULT_PERMISSIONS);
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    const hasPermissions = userColumns.some((col) => col.name === 'permissions');
    let result: any;
    if (hasPermissions) {
      result = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, full_name, role, is_active, permissions, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 'super_admin', 1, ?, datetime('now'), datetime('now'))`
        )
        .run(username, passwordHash, fullName, permsJson);
    } else {
      result = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, full_name, role, is_active, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 'super_admin', 1, datetime('now'), datetime('now'))`
        )
        .run(username, passwordHash, fullName);
    }
    return c.json({ success: true, userId: result?.lastInsertRowid || null });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to create super admin' }, 500);
  }
});

/** Public: copy this request code to the developer signer; response token format matches bootstrap activation. */
api.post('/bootstrap/superadmin-password-reset/request', (c) => {
  try {
    const status = readBootstrapStatus();
    if (!status.activated) return c.json({ error: 'Installation is not activated' }, 403);
    if (!status.machineId) return c.json({ error: 'Machine id is not available for this install' }, 400);
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = {
      machine_id: status.machineId,
      product_id: BOOTSTRAP_PRODUCT_ID,
      purpose: 'superadmin_password_reset',
      issued_at: Math.floor(Date.now() / 1000),
      nonce,
    };
    const requestCode = base64UrlEncode(JSON.stringify(payload));
    return c.json({ requestCode, requestPayload: payload });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to generate request' }, 500);
  }
});

/** Public: apply developer-signed token + new password (same signing pipeline as app activation). */
api.post('/bootstrap/superadmin-password-reset/complete', async (c) => {
  try {
    const status = readBootstrapStatus();
    if (!status.activated) return c.json({ error: 'Installation is not activated' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const requestCode = String(body?.requestCode || '').trim();
    const responseToken = String(body?.responseToken || '').trim();
    const newPassword = String(body?.newPassword || body?.password || '');
    const confirm = String(body?.confirmPassword || body?.passwordConfirm || '');
    const usernameHint = String(body?.username || '').trim();

    if (!requestCode || !responseToken) {
      return c.json({ error: 'requestCode and responseToken are required' }, 400);
    }
    if (!newPassword || newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters' }, 400);
    }
    if (newPassword !== confirm) {
      return c.json({ error: 'Password and confirmation do not match' }, 400);
    }

    const verified = verifySuperadminPasswordResetResponse(requestCode, responseToken);
    if (verified.machineId !== status.machineId) {
      return c.json({ error: 'Token does not match this installation' }, 400);
    }

    const supers = db
      .prepare(`SELECT id, username FROM users WHERE role = 'super_admin' AND is_active = 1`)
      .all() as { id: number; username: string }[];

    if (!supers?.length) {
      return c.json({ error: 'No active super admin account exists' }, 404);
    }

    let target: { id: number; username: string } | undefined;
    const signedUser = verified.targetUsername;
    if (signedUser) {
      target = supers.find((s) => s.username.toLowerCase() === signedUser.toLowerCase());
      if (!target) {
        return c.json({ error: 'Signed token username does not match a super admin on this system' }, 400);
      }
    } else if (supers.length === 1) {
      target = supers[0];
    } else if (usernameHint) {
      target = supers.find((s) => s.username.toLowerCase() === usernameHint.toLowerCase());
      if (!target) {
        return c.json({ error: 'username does not match a super admin on this system' }, 400);
      }
    } else {
      return c.json(
        {
          error: 'Multiple super admin accounts exist. Pass username, or include target_username in the signed token.',
        },
        400
      );
    }

    const passwordHash = await hashPassword(newPassword);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(passwordHash, target.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(target.id);

    return c.json({ success: true, username: target.username });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Password reset failed' }, 400);
  }
});

// Helper function to ensure activity_log table exists
function ensureActivityLogTable() {
  try {
    // Check if table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='activity_log'
    `).get();
    
    if (!tableExists) {
      // Create the table
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          action_data TEXT,
          deleted_data TEXT,
          modified_data TEXT,
          performed_by INTEGER,
          performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          permanent_delete_at DATETIME,
          is_undone BOOLEAN DEFAULT 0,
          undone_at DATETIME,
          FOREIGN KEY (performed_by) REFERENCES users(id)
        )
      `);
    }
  } catch (error) {
    console.error('Error ensuring activity_log table exists:', error);
  }
}

// Helper function to ensure activity_log_settings table exists
function ensureActivityLogSettingsTable() {
  try {
    // Check if table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='activity_log_settings'
    `).get();
    
    if (!tableExists) {
      // Create the table
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key TEXT UNIQUE NOT NULL,
          setting_value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Initialize default settings
      const defaultRetentionDays = db.prepare('SELECT * FROM activity_log_settings WHERE setting_key = ?').get('retention_days');
      if (!defaultRetentionDays) {
        db.prepare('INSERT INTO activity_log_settings (setting_key, setting_value) VALUES (?, ?)').run('retention_days', '30');
        db.prepare('INSERT INTO activity_log_settings (setting_key, setting_value) VALUES (?, ?)').run('alert_days_before', '7');
      }
    }
  } catch (error) {
    console.error('Error ensuring activity_log_settings table exists:', error);
  }
}

// Helper function to get retention days with fallback
function getRetentionDays(): number {
  ensureActivityLogSettingsTable();
  try {
    const retentionDays = db.prepare('SELECT setting_value FROM activity_log_settings WHERE setting_key = ?').get('retention_days') as any;
    return retentionDays ? parseInt(retentionDays.setting_value) : 30;
  } catch (error) {
    console.error('Error getting retention days:', error);
    return 30; // Default fallback
  }
}

function getAllStores() {
  return db.prepare(`
    SELECT * FROM stores WHERE is_active = 1 ORDER BY name ASC
  `).all() as any[];
}

/**
 * Browsers reject SameSite=None without Secure; plain HTTP same-origin installs need Lax.
 * Cross-site + HTTPS API: None + Secure so credentialed fetches from another origin work.
 */
function posSessionCookieSiteAttrs(c: Context): string {
  const clientOrigin = (c.req.header('X-Client-Origin') || '').trim();
  let apiOrigin = '';
  try {
    apiOrigin = new URL(c.req.url).origin;
  } catch {
    /* ignore */
  }
  const crossSite = Boolean(clientOrigin && apiOrigin && clientOrigin !== apiOrigin);
  const httpsApi = c.req.url.startsWith('https:');
  if (crossSite && httpsApi) return 'SameSite=None; Secure';
  return 'SameSite=Lax';
}

function posSessionSetCookieHeader(c: Context, token: string, maxAgeSec: number): string {
  return `session_token=${token}; HttpOnly; Path=/; ${posSessionCookieSiteAttrs(c)}; Max-Age=${maxAgeSec}`;
}

function posSessionClearCookieHeader(c: Context): string {
  return `session_token=; HttpOnly; Path=/; ${posSessionCookieSiteAttrs(c)}; Max-Age=0`;
}

/** Unauthenticated: after failed login attempts, decide which “forgot password” flow applies. */
api.post('/auth/recovery-eligibility', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const username = String(body?.username || '').trim();
    if (!username) return c.json({ isSuperAdmin: false });
    const row = db
      .prepare(`SELECT role FROM users WHERE username = ? AND is_active = 1`)
      .get(username) as { role: string } | undefined;
    if (!row) return c.json({ isSuperAdmin: false });
    return c.json({ isSuperAdmin: row.role === 'super_admin' });
  } catch {
    return c.json({ isSuperAdmin: false });
  }
});

// Login endpoint
api.post('/auth/login', async (c) => {
  try {
    const { username, password, storeId } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }

    // Get user
    const user = getUserByUsernameOrEmail(username);
    
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    
    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const shiftState = parseWorkShiftWindow(user.work_shift, new Date());
    if (shiftState.hasShift && !shiftState.isInShift) {
      return c.json(
        {
          error: 'Your shift is currently inactive. You can sign in when your next shift starts.',
          nextShiftStartsAt: shiftState.nextStartAt.toISOString(),
        },
        403
      );
    }

    // Check user permissions before allowing login
    // Get user permissions from database
    const userWithPermissions: any = db.prepare('SELECT permissions FROM users WHERE id = ?').get(user.id);
    let userPermissions: string[] = [];
    
    if (userWithPermissions?.permissions) {
      try {
        const parsed = typeof userWithPermissions.permissions === 'string' 
          ? JSON.parse(userWithPermissions.permissions) 
          : userWithPermissions.permissions;
        userPermissions = Array.isArray(parsed) ? parsed : parsed.split(',').map((p: string) => p.trim());
      } catch (e) {
        // If parsing fails, try comma-separated string
        try {
          userPermissions = userWithPermissions.permissions.split(',').map((p: string) => p.trim());
        } catch {
          userPermissions = [];
        }
      }
    }

    // Check permissions based on role
    if (user.role === 'cashier') {
      // Cashiers must have access_pos or edit_prices permission
      const hasPOSAccess = userPermissions.includes('access_pos') || userPermissions.includes('edit_prices');
      if (!hasPOSAccess) {
        return c.json({ 
          error: 'Access denied. You do not have permission to access the POS system. Please contact an administrator.' 
        }, 403);
      }
    } else if (user.role === 'admin' || user.role === 'super_admin') {
      // Admins and super_admins always have access (bypass permission check)
      // No permission check needed for admins
    } else {
      // For other roles, require access_pos, edit_prices, or access_admin permission
      const hasPOSAccess = userPermissions.includes('access_pos') || userPermissions.includes('edit_prices');
      const hasAdminAccess = userPermissions.includes('access_admin');
      
      if (!hasPOSAccess && !hasAdminAccess) {
        return c.json({ 
          error: 'Access denied. You do not have the required permissions to access the system. Please contact an administrator.' 
        }, 403);
      }
    }

    // Handle store selection based on role
    let selectedStoreId: number | null = null;
    
    if (user.role === 'super_admin') {
      // Super admin can login without store or with any store
      selectedStoreId = storeId || null;
    } else if (user.role === 'admin' || user.role === 'cashier') {
      // Admin and cashier - automatically select their primary store or first available store
      const userStores = getUserStores(user.id);
      
      if (userStores.length === 0) {
        return c.json({ error: 'No stores assigned to your account. Please contact an administrator.' }, 403);
      }
      
      // If storeId is provided, verify user has access to it
      if (storeId) {
        const hasAccess = userStores.some((store: any) => store.id === storeId);
        if (!hasAccess) {
          return c.json({ error: 'You do not have access to this store' }, 403);
        }
        selectedStoreId = storeId;
      } else {
        // Automatically select primary store (is_primary = 1) or first available store
        const primaryStore = userStores.find((store: any) => store.is_primary === 1 || store.is_primary === true);
        selectedStoreId = primaryStore ? primaryStore.id : userStores[0].id;
      }
    }

    // Create session
    const session = await createSession(user.id, selectedStoreId);

    // Get store info if store is selected
    let storeInfo: any = null;
    if (selectedStoreId) {
      const stores = await sql(`
        SELECT id, name, address, phone, email FROM stores WHERE id = ?
      `, [selectedStoreId]);
      storeInfo = stores[0] || null;
    }

    const shiftStateLogin = parseWorkShiftWindow(user.work_shift, new Date());
    const shiftExtensionLogin = Math.min(shiftExtensionByToken.get(session.token) || 0, SHIFT_MAX_EXTENSION_MS);
    const shiftEndsAtLogin = shiftStateLogin.hasShift ? shiftStateLogin.endAt.toISOString() : null;
    const shiftHardLogoutAtLogin = shiftStateLogin.hasShift
      ? new Date(shiftStateLogin.endAt.getTime() + SHIFT_AUTO_LOGOUT_GRACE_MS + shiftExtensionLogin).toISOString()
      : null;

    // Create response (match /auth/session shape so client can hydrate without a follow-up session fetch)
    const response = c.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        workShift: user.work_shift || null,
        shiftInfo: {
          hasShift: shiftStateLogin.hasShift,
          isInShift: shiftStateLogin.isInShift,
          shiftEndsAt: shiftEndsAtLogin,
          hardLogoutAt: shiftHardLogoutAtLogin,
          extensionMs: shiftExtensionLogin,
          maxExtensionMs: SHIFT_MAX_EXTENSION_MS,
          graceMs: SHIFT_AUTO_LOGOUT_GRACE_MS,
          nextShiftStartsAt:
            shiftStateLogin.hasShift && !shiftStateLogin.isInShift
              ? shiftStateLogin.nextStartAt.toISOString()
              : null,
        },
        permissions: userPermissions, // Include permissions in response
      },
      store: storeInfo,
      sessionToken: session.token,
    });

    const maxAge = 60 * 60 * 24 * 7; // 7 days in seconds
    response.headers.set('Set-Cookie', posSessionSetCookieHeader(c, session.token, maxAge));

    return response;

  } catch (error: any) {
    console.error('Login error:', error);
    return c.json({ error: 'Failed to login' }, 500);
  }
});

// Logout endpoint
api.post('/auth/logout', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (token) {
      deleteSession(token);
    }

    const response = c.json({ success: true });
    response.headers.set('Set-Cookie', posSessionClearCookieHeader(c));

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return c.json({ error: 'Failed to logout' }, 500);
  }
});

// Session check endpoint
api.get('/auth/session', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ authenticated: false });
    }

    const session = getSession(token);

    if (!session) {
      const response = c.json({ authenticated: false });
      response.headers.set('Set-Cookie', posSessionClearCookieHeader(c));
      return response;
    }

    const shiftState = parseWorkShiftWindow(session.workShift, new Date());
    const shiftExtension = Math.min(shiftExtensionByToken.get(token) || 0, SHIFT_MAX_EXTENSION_MS);
    const shiftEndsAt = shiftState.hasShift ? shiftState.endAt.toISOString() : null;
    const shiftHardLogoutAt = shiftState.hasShift
      ? new Date(shiftState.endAt.getTime() + SHIFT_AUTO_LOGOUT_GRACE_MS + shiftExtension).toISOString()
      : null;

    // Get user permissions from database
    const userWithPermissions: any = db.prepare('SELECT permissions FROM users WHERE id = ?').get(session.userId);
    let userPermissions: string[] = [];
    
    if (userWithPermissions?.permissions) {
      try {
        const parsed = typeof userWithPermissions.permissions === 'string' 
          ? JSON.parse(userWithPermissions.permissions) 
          : userWithPermissions.permissions;
        userPermissions = Array.isArray(parsed) ? parsed : parsed.split(',').map((p: string) => p.trim());
      } catch (e) {
        // If parsing fails, try comma-separated string
        try {
          userPermissions = userWithPermissions.permissions.split(',').map((p: string) => p.trim());
        } catch {
          userPermissions = [];
        }
      }
    }

    return c.json({
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
        workShift: session.workShift || null,
        shiftInfo: {
          hasShift: shiftState.hasShift,
          isInShift: shiftState.isInShift,
          shiftEndsAt,
          hardLogoutAt: shiftHardLogoutAt,
          extensionMs: shiftExtension,
          maxExtensionMs: SHIFT_MAX_EXTENSION_MS,
          graceMs: SHIFT_AUTO_LOGOUT_GRACE_MS,
          nextShiftStartsAt: shiftState.hasShift && !shiftState.isInShift ? shiftState.nextStartAt.toISOString() : null,
        },
        permissions: userPermissions, // Include permissions in session response
      },
      store: session.storeId ? {
        id: session.storeId,
        name: session.storeName,
      } : null,
    });

  } catch (error: any) {
    console.error('Session check error:', error);
    return c.json({ authenticated: false });
  }
});

api.post('/auth/shift-extend', async (c) => {
  try {
    const token = c.get('posSessionToken');
    if (!token) return c.json({ error: 'Not authenticated' }, 401);
    const session = getSession(token);
    if (!session) return c.json({ error: 'Invalid session' }, 401);

    const now = new Date();
    const shiftState = parseWorkShiftWindow(session.workShift, now);
    if (!shiftState.hasShift) {
      return c.json({ error: 'No shift schedule is set for this account.' }, 400);
    }
    if (shiftState.isInShift) {
      return c.json({ error: 'Your shift is still active. Extension is available only after shift end.' }, 400);
    }

    const current = Math.min(shiftExtensionByToken.get(token) || 0, SHIFT_MAX_EXTENSION_MS);
    if (current >= SHIFT_MAX_EXTENSION_MS) {
      return c.json(
        { error: 'Maximum extra time for this shift has already been used.' },
        400
      );
    }
    const next = Math.min(current + SHIFT_EXTENSION_MS, SHIFT_MAX_EXTENSION_MS);
    shiftExtensionByToken.set(token, next);
    return c.json({
      success: true,
      extensionMs: next,
      hardLogoutAt: new Date(shiftState.endAt.getTime() + SHIFT_AUTO_LOGOUT_GRACE_MS + next).toISOString(),
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to extend shift session' }, 500);
  }
});

// Get user stores endpoint
api.get('/auth/stores', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    let stores: any[] = [];

    if (session.role === 'super_admin') {
      // Super admin can see all stores
      stores = getAllStores();
    } else {
      // Admin and cashier can only see their assigned stores
      stores = getUserStores(session.userId);
    }

    return c.json({ stores });

  } catch (error: any) {
    console.error('Get stores error:', error);
    return c.json({ error: 'Failed to get stores' }, 500);
  }
});

// Get current user endpoint
api.get('/auth/me', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ authenticated: false }, 401);
    }

    const session = getSession(token);

    if (!session) {
      const response = c.json({ authenticated: false }, 401);
      response.headers.set('Set-Cookie', posSessionClearCookieHeader(c));
      return response;
    }

    return c.json({
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
      },
      store: session.storeId ? {
        id: session.storeId,
        name: session.storeName,
      } : null,
    });

  } catch (error: any) {
    console.error('Get user error:', error);
    return c.json({ authenticated: false }, 401);
  }
});

// Get all users (for admin management)
api.get('/auth/users', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can view users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Filter by store if not super admin, and filter by login credentials (username and password_hash)
    let users: any[] = [];
    try {
      if (session.role === 'super_admin') {
        // Super admin can see all users (employees with login credentials - username and password_hash)
        users = db.prepare(`
          SELECT u.*, 
                 GROUP_CONCAT(DISTINCT s.name) as store_names,
                 GROUP_CONCAT(DISTINCT s.id) as store_ids
          FROM users u
          LEFT JOIN user_stores us ON u.id = us.user_id
          LEFT JOIN stores s ON us.store_id = s.id
          WHERE u.role != 'super_admin' 
            AND u.username IS NOT NULL 
            AND u.username != ''
            AND u.username NOT LIKE '_revoked_%'
            AND u.password_hash IS NOT NULL 
            AND u.password_hash != ''
          GROUP BY u.id
          ORDER BY u.created_at DESC
        `).all() as any[];
        
      } else {
        // Admin can only see users from their store (employees with login credentials - username and password_hash)
        if (!session.storeId) {
          return c.json({ error: 'Store ID required for admin users' }, 400);
        }
        
        const storeId = parseInt(session.storeId);
        if (isNaN(storeId)) {
          return c.json({ error: 'Invalid store ID' }, 400);
        }
        
        // Get all employees from this store that have login credentials
        const allEmployees = db.prepare(`
          SELECT u.*
          FROM users u
          INNER JOIN user_stores us ON u.id = us.user_id
          WHERE us.store_id = ? 
            AND u.role != 'super_admin'
            AND u.username IS NOT NULL 
            AND u.username != ''
            AND u.username NOT LIKE '_revoked_%'
            AND u.password_hash IS NOT NULL 
            AND u.password_hash != ''
          ORDER BY u.created_at DESC
        `).all(storeId) as any[];
        
        // Now add store information for each user
        users = allEmployees.map((user: any) => {
          // Get store names and IDs for this user
          const userStores = db.prepare(`
            SELECT s.id, s.name
            FROM stores s
            INNER JOIN user_stores us ON s.id = us.store_id
            WHERE us.user_id = ?
          `).all(user.id) as any[];
          
          return {
            ...user,
            store_names: userStores.map((s: any) => s.name).join(','),
            store_ids: userStores.map((s: any) => s.id).join(',')
          };
        });
        
      }
    } catch (queryError: any) {
      console.error('Query error:', queryError);
      return c.json({ error: 'Failed to query users', details: queryError.message }, 500);
    }

    console.log('Found users:', users.length);
    return c.json({ users });

  } catch (error: any) {
    console.error('Get users error:', error);
    return c.json({ error: 'Failed to get users' }, 500);
  }
});

// Get all employees (all roles except super_admin, filtered by store for admins)
api.get('/auth/employees', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can view employees
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Filter by store if not super admin
    let employees: any[] = [];
    try {
      if (session.role === 'super_admin') {
        // Super admin can see all employees from all stores
        employees = db.prepare(`
          SELECT u.*, 
                 GROUP_CONCAT(DISTINCT s.name) as store_names,
                 GROUP_CONCAT(DISTINCT s.id) as store_ids
          FROM users u
          LEFT JOIN user_stores us ON u.id = us.user_id
          LEFT JOIN stores s ON us.store_id = s.id
          WHERE u.role != 'super_admin'
          GROUP BY u.id
          ORDER BY u.created_at DESC
        `).all() as any[];
      } else {
        // Admin can only see employees from their store (all roles except super_admin)
        if (!session.storeId) {
          return c.json({ error: 'Store ID required for admin users' }, 400);
        }
        
        const storeId = parseInt(session.storeId);
        
        if (isNaN(storeId)) {
          console.error('[API] Invalid store ID:', session.storeId);
          return c.json({ error: 'Invalid store ID' }, 400);
        }
        
        // Verify store exists
        const store = db.prepare('SELECT id, name FROM stores WHERE id = ?').get(storeId);
        if (!store) {
          console.error('[API] Store not found:', storeId);
          return c.json({ error: 'Store not found' }, 404);
        }
        
        // Get all employees from this store (all roles except super_admin)
        const allEmployees = db.prepare(`
          SELECT u.*
          FROM users u
          INNER JOIN user_stores us ON u.id = us.user_id
          WHERE us.store_id = ? AND u.role != 'super_admin'
          ORDER BY u.created_at DESC
        `).all(storeId) as any[];
        // Now add store information for each employee
        employees = allEmployees.map((employee: any) => {
          // Get store names and IDs for this employee
          const employeeStores = db.prepare(`
            SELECT s.id, s.name
            FROM stores s
            INNER JOIN user_stores us ON s.id = us.store_id
            WHERE us.user_id = ?
          `).all(employee.id) as any[];
          
          return {
            ...employee,
            store_names: employeeStores.map((s: any) => s.name).join(','),
            store_ids: employeeStores.map((s: any) => s.id).join(',')
          };
        });
        
      }
    } catch (queryError: any) {
      console.error('[API] Query error:', queryError);
      return c.json({ error: 'Failed to query employees', details: queryError.message }, 500);
    }

    // Final verification - ensure we have an array
    if (!Array.isArray(employees)) {
      console.error('[API] ERROR: employees is not an array! Type:', typeof employees);
      employees = [];
    }
    return c.json({ employees: employees || [] });

  } catch (error: any) {
    console.error('Get employees error:', error);
    return c.json({ error: 'Failed to get employees' }, 500);
  }
});

// Create a new user
api.post('/auth/users', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can create users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const {
      username,
      email,
      password,
      fullName,
      role,
      storeIds: storeIdsRaw,
      permissions,
      employeeId,
      salary,
      workShift,
      hireDate,
    } = await c.req.json();

    if (!username || !password || !fullName || !role) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Validate role - allow all roles now
    // Super admin can create any role, admin can create any role except admin and super_admin
    if (session.role === 'admin') {
      if (role === 'admin' || role === 'super_admin') {
        return c.json({ error: 'Admins cannot assign admin or super_admin roles' }, 403);
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
    const hasPermissions = userColumns.some(col => col.name === 'permissions');
    const permissionsJson = normalizePermissionsForDb(permissions);

    let effectiveStoreIds: number[] = Array.isArray(storeIdsRaw) ? storeIdsRaw.map((id: number) => Number(id)).filter((id: number) => Number.isFinite(id)) : [];
    if (session.role === 'admin' && role !== 'super_admin') {
      const sid = session.storeId != null ? Number(session.storeId) : NaN;
      if (!effectiveStoreIds.length && Number.isFinite(sid)) {
        effectiveStoreIds = [sid];
      }
      if (Number.isFinite(sid)) {
        effectiveStoreIds = effectiveStoreIds.filter((id: number) => Number(id) === sid);
      }
    }

    // Create user - if employeeId is provided, update existing employee record
    let userId: number;
    if (employeeId) {
      // Check if employee with this ID exists
      const existingEmployee: any = db.prepare('SELECT * FROM users WHERE id = ?').get(employeeId);
      if (existingEmployee) {
        // Update existing employee to add login info
        const updates: string[] = [];
        const params: any[] = [];

        updates.push('username = ?');
        params.push(username);
        if (email !== undefined) {
          updates.push('email = ?');
          params.push(email || null);
        }
        updates.push('password_hash = ?');
        params.push(passwordHash);
        updates.push('full_name = ?');
        params.push(fullName);
        updates.push('role = ?');
        params.push(role);
        if (hasPermissions && permissionsJson != null) {
          updates.push('permissions = ?');
          params.push(permissionsJson);
        }
        if (salary !== undefined && userColumns.some(col => col.name === 'salary')) {
          updates.push('salary = ?');
          params.push(salary != null && salary !== '' ? Number(salary) : 0);
        }
        if (workShift !== undefined && userColumns.some(col => col.name === 'work_shift')) {
          updates.push('work_shift = ?');
          params.push(workShift ?? null);
        }
        if (hireDate !== undefined && userColumns.some(col => col.name === 'hire_date')) {
          updates.push('hire_date = ?');
          params.push(hireDate ?? null);
        }
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(employeeId);

        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        userId = employeeId;
      } else {
        return c.json({ error: 'Employee not found' }, 404);
      }
    } else {
      const hasSalary = userColumns.some(col => col.name === 'salary');
      const hasWorkShift = userColumns.some(col => col.name === 'work_shift');
      const hasHireDate = userColumns.some(col => col.name === 'hire_date');

      const cols = ['username', 'email', 'password_hash', 'full_name', 'role'];
      const vals: any[] = [username, email || null, passwordHash, fullName, role];
      if (hasPermissions) {
        cols.push('permissions');
        vals.push(permissionsJson);
      }
      if (hasSalary) {
        cols.push('salary');
        vals.push(salary != null && salary !== '' ? Number(salary) : 0);
      }
      if (hasWorkShift) {
        cols.push('work_shift');
        vals.push(workShift ?? null);
      }
      if (hasHireDate) {
        cols.push('hire_date');
        vals.push(hireDate ?? null);
      }
      const placeholders = cols.map(() => '?').join(', ');
      const result = db
        .prepare(`INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders})`)
        .run(...vals);
      userId = Number(result.lastInsertRowid);
    }

    // Assign stores (required for admin and cashier)
    if (role !== 'super_admin' && effectiveStoreIds.length > 0) {
      let validStoreIds = effectiveStoreIds;

      if (session.role === 'admin') {
        const sid = session.storeId != null ? Number(session.storeId) : NaN;
        validStoreIds = effectiveStoreIds.filter((id: number) => Number(id) === sid);
      }

      // If employeeId was provided (updating existing employee), delete existing store relationships first
      if (employeeId) {
        db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);
      }

      // Insert user-store relationships (use INSERT OR IGNORE to handle duplicates gracefully)
      const insertUserStore = db.prepare(`
        INSERT OR IGNORE INTO user_stores (user_id, store_id, is_primary)
        VALUES (?, ?, ?)
      `);

      // Also update is_primary for the first store
      const updatePrimary = db.prepare(`
        UPDATE user_stores SET is_primary = ? WHERE user_id = ? AND store_id = ?
      `);

      for (let i = 0; i < validStoreIds.length; i++) {
        const storeId = validStoreIds[i];
        const isPrimary = i === 0 ? 1 : 0;
        
        // Try to insert, if it already exists, update is_primary
        try {
          insertUserStore.run(userId, storeId, isPrimary);
        } catch (error: any) {
          // If insert fails due to unique constraint, update instead
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            updatePrimary.run(isPrimary, userId, storeId);
          } else {
            throw error;
          }
        }
      }
    }

    // Get created user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    // Log admin action
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertLog.run(
        session.userId,
        'admin_action',
        `Created new user: ${username}`,
        'user',
        userId,
        JSON.stringify({
          action: 'create',
          target_user_id: userId,
          target_username: username,
          role: role,
          email: email,
          full_name: fullName,
          stores_assigned: effectiveStoreIds
        })
      );
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    // Log to activity_log table
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      // Determine entity type - if employeeId was provided, it's an employee being converted to user
      // Otherwise, it's a new user/employee being created
      const entityType = employeeId ? 'employee' : 'user';

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        entityType,
        userId,
        'create',
        JSON.stringify({ username, full_name: fullName, role, email }),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    return c.json({ success: true, user });

  } catch (error: any) {
    console.error('Create user error:', error);
    if (error.message?.includes('UNIQUE')) {
      return c.json({ error: 'Username or email already exists' }, 400);
    }
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

// Update user - support both path parameter and body id
api.put('/auth/users/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can update users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const pathId = c.req.param('id');
    const { id, username, email, fullName, role, isActive, storeIds, password, permissions, salary, workShift, hireDate } = await c.req.json();

    // Use path parameter id if provided, otherwise use body id
    const userId = pathId ? parseInt(pathId, 10) : (id ? parseInt(id, 10) : null);

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Check if user exists and user has access
    const existingUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Admin can only update users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (session.role === 'admin' && existingUser.role === 'super_admin') {
      return c.json({ error: 'Only a super admin can change a super admin account' }, 403);
    }

    // Check if permissions column exists
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
    const hasPermissions = userColumns.some(col => col.name === 'permissions');

    // Get original user data before update for activity log
    const originalUser = { ...existingUser };

    // Update user
    const updates: string[] = [];
    const params: any[] = [];

    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(fullName);
    }
    if (role !== undefined) {
      // Super admin can change any role, admin can change to any role except admin and super_admin
      if (session.role === 'admin') {
        if (role === 'admin' || role === 'super_admin') {
          return c.json({ error: 'Admins cannot assign admin or super_admin roles' }, 403);
        }
      }
      updates.push('role = ?');
      params.push(role);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (password !== undefined && password !== '') {
      const passwordHash = await hashPassword(password);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }
    if (hasPermissions && permissions !== undefined) {
      const permissionsJson = permissions && Array.isArray(permissions) 
        ? JSON.stringify(permissions) 
        : (typeof permissions === 'string' ? permissions : (permissions || null));
      updates.push('permissions = ?');
      params.push(permissionsJson);
    }
    // Handle employee-specific fields if they exist
    const employeeColumns = userColumns.filter(col => ['salary', 'work_shift', 'hire_date'].includes(col.name));
    if (salary !== undefined && employeeColumns.some(col => col.name === 'salary')) {
      updates.push('salary = ?');
      params.push(salary);
    }
    if (workShift !== undefined && employeeColumns.some(col => col.name === 'work_shift')) {
      updates.push('work_shift = ?');
      params.push(workShift);
    }
    if (hireDate !== undefined && employeeColumns.some(col => col.name === 'hire_date')) {
      updates.push('hire_date = ?');
      params.push(hireDate);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);

      db.prepare(`
        UPDATE users SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // Update store assignments if provided
    if (storeIds !== undefined && role !== 'super_admin') {
      // Delete existing assignments
      db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);

      // Add new assignments
      if (storeIds.length > 0) {
        let validStoreIds = storeIds;
        
        if (session.role === 'admin') {
          // Admin can only assign their store
          validStoreIds = storeIds.filter((storeId: number) => storeId === session.storeId);
        }

        const insertUserStore = db.prepare(`
          INSERT INTO user_stores (user_id, store_id, is_primary)
          VALUES (?, ?, ?)
        `);

        for (let i = 0; i < validStoreIds.length; i++) {
          insertUserStore.run(userId, validStoreIds[i], i === 0 ? 1 : 0);
        }
      }
    }

    // Get updated user
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    // Log admin action
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const changes: string[] = [];
      if (username !== undefined) changes.push('username');
      if (email !== undefined) changes.push('email');
      if (fullName !== undefined) changes.push('full_name');
      if (role !== undefined) changes.push('role');
      if (isActive !== undefined) changes.push('status');
      if (password !== undefined && password !== '') changes.push('password');
      if (storeIds !== undefined) changes.push('store_assignments');
      
      insertLog.run(
        session.userId,
        'admin_action',
        `Updated user: ${user?.username || userId}`,
        'user',
        userId,
        JSON.stringify({
          action: 'update',
          target_user_id: userId,
          target_username: user?.username,
          changes: changes,
          updated_fields: {
            username: username !== undefined ? username : undefined,
            email: email !== undefined ? email : undefined,
            full_name: fullName !== undefined ? fullName : undefined,
            role: role !== undefined ? role : undefined,
            is_active: isActive !== undefined ? isActive : undefined,
            stores_updated: storeIds !== undefined ? true : undefined
          }
        })
      );
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    // Log to activity_log table
    if (session && updates.length > 0 && originalUser) {
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      const modifiedUser = { ...originalUser };
      if (username !== undefined) modifiedUser.username = username;
      if (email !== undefined) modifiedUser.email = email;
      if (fullName !== undefined) modifiedUser.full_name = fullName;
      if (role !== undefined) modifiedUser.role = role;
      if (isActive !== undefined) modifiedUser.is_active = isActive ? 1 : 0;
      if (hasPermissions && permissions !== undefined) {
        modifiedUser.permissions = permissions && Array.isArray(permissions) ? JSON.stringify(permissions) : (typeof permissions === 'string' ? permissions : permissions);
      }
      if (salary !== undefined) modifiedUser.salary = salary;
      if (workShift !== undefined) modifiedUser.work_shift = workShift;
      if (hireDate !== undefined) modifiedUser.hire_date = hireDate;

      // Determine entity type - if it's an employee (has employee fields or no username), log as 'employee'
      const entityType = (!originalUser.username && originalUser.full_name) ? 'employee' : 'user';

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, modified_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityType,
        userId,
        'update',
        JSON.stringify({ username: user?.username || originalUser.username || originalUser.full_name, id: userId }),
        JSON.stringify(originalUser),
        JSON.stringify(modifiedUser),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    return c.json({ success: true, user });

  } catch (error: any) {
    console.error('Update user error:', error);
    if (error.message?.includes('UNIQUE')) {
      return c.json({ error: 'Username or email already exists' }, 400);
    }
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

// Also support body id version for backward compatibility
api.put('/auth/users', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can update users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { id, username, email, fullName, role, isActive, storeIds, password, permissions } = await c.req.json();

    if (!id) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    // Check if user exists and user has access
    const existingUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    
    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Admin can only update users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(id, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    // Check if permissions column exists
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
    const hasPermissions = userColumns.some(col => col.name === 'permissions');

    // Update user
    const updates: string[] = [];
    const params: any[] = [];

    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(fullName);
    }
    if (role !== undefined) {
      // Super admin can change any role, admin can change to any role except admin and super_admin
      if (session.role === 'admin') {
        if (role === 'admin' || role === 'super_admin') {
          return c.json({ error: 'Admins cannot assign admin or super_admin roles' }, 403);
        }
      }
      updates.push('role = ?');
      params.push(role);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (password !== undefined && password !== '') {
      const passwordHash = await hashPassword(password);
      updates.push('password_hash = ?');
      params.push(passwordHash);
    }
    if (hasPermissions && permissions !== undefined) {
      const permissionsJson = permissions && Array.isArray(permissions) 
        ? JSON.stringify(permissions) 
        : (permissions || null);
      updates.push('permissions = ?');
      params.push(permissionsJson);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`
        UPDATE users SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // Update store assignments if provided
    if (storeIds !== undefined && role !== 'super_admin') {
      // Delete existing assignments
      db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(id);

      // Add new assignments
      if (storeIds.length > 0) {
        let validStoreIds = storeIds;
        
        if (session.role === 'admin') {
          // Admin can only assign their store
          validStoreIds = storeIds.filter((storeId: number) => storeId === session.storeId);
        }

        const insertUserStore = db.prepare(`
          INSERT INTO user_stores (user_id, store_id, is_primary)
          VALUES (?, ?, ?)
        `);

        for (let i = 0; i < validStoreIds.length; i++) {
          insertUserStore.run(id, validStoreIds[i], i === 0 ? 1 : 0);
        }
      }
    }

    // Get original user data before update for activity log
    const originalUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;

    // Get updated user
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    // Log admin action
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const changes: string[] = [];
      if (username !== undefined) changes.push('username');
      if (email !== undefined) changes.push('email');
      if (fullName !== undefined) changes.push('full_name');
      if (role !== undefined) changes.push('role');
      if (isActive !== undefined) changes.push('status');
      if (password !== undefined && password !== '') changes.push('password');
      if (storeIds !== undefined) changes.push('store_assignments');
      
      insertLog.run(
        session.userId,
        'admin_action',
        `Updated user: ${user?.username || id}`,
        'user',
        id,
        JSON.stringify({
          action: 'update',
          target_user_id: id,
          target_username: user?.username,
          changes: changes,
          updated_fields: {
            username: username !== undefined ? username : undefined,
            email: email !== undefined ? email : undefined,
            full_name: fullName !== undefined ? fullName : undefined,
            role: role !== undefined ? role : undefined,
            is_active: isActive !== undefined ? isActive : undefined,
            stores_updated: storeIds !== undefined ? true : undefined
          }
        })
      );
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    // Log to activity_log table
    if (session && updates.length > 0 && originalUser) {
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      const modifiedUser = { ...originalUser };
      if (username !== undefined) modifiedUser.username = username;
      if (email !== undefined) modifiedUser.email = email;
      if (fullName !== undefined) modifiedUser.full_name = fullName;
      if (role !== undefined) modifiedUser.role = role;
      if (isActive !== undefined) modifiedUser.is_active = isActive ? 1 : 0;
      if (hasPermissions && permissions !== undefined) {
        modifiedUser.permissions = permissions && Array.isArray(permissions) ? JSON.stringify(permissions) : permissions;
      }

      // Determine entity type - if it's an employee (has employee fields or no username), log as 'employee'
      const entityType = (!originalUser.username && originalUser.full_name) ? 'employee' : 'user';

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, modified_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityType,
        id,
        'update',
        JSON.stringify({ username: user?.username || originalUser.username || originalUser.full_name, id }),
        JSON.stringify(originalUser),
        JSON.stringify(modifiedUser),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    return c.json({ success: true, user });

  } catch (error: any) {
    console.error('Update user error:', error);
    if (error.message?.includes('UNIQUE')) {
      return c.json({ error: 'Username or email already exists' }, 400);
    }
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

// Revoke user access (remove login credentials and permissions, keep as employee)
// Support both query parameter and path parameter
api.delete('/auth/users/:id', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can delete users, or admin can delete cashiers from their store
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const id = c.req.param('id');

    if (!id) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const userId = parseInt(id, 10);

    // Prevent revoking own account access
    if (userId === session.userId) {
      return c.json({ error: 'Cannot revoke your own account access' }, 400);
    }

    // Check if user exists
    const userToRevoke: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userToRevoke) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Prevent revoking super_admin access
    if (userToRevoke.role === 'super_admin') {
      return c.json({ error: 'Cannot revoke super admin access' }, 403);
    }

    // Admin can revoke access for users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized - user not in your store' }, 403);
      }
    }

    // Check if permissions column exists
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
    const hasPermissions = userColumns.some(col => col.name === 'permissions');

    // Revoke user access: remove login credentials and permissions
    // Keep the employee record (full_name, role, etc.)
    const updates: string[] = [];
    const params: any[] = [];

    // Set username to a placeholder that ensures uniqueness (using timestamp + user ID)
    // This satisfies the NOT NULL and UNIQUE constraints
    const revokedUsername = `_revoked_${userId}_${Date.now()}`;
    updates.push('username = ?');
    params.push(revokedUsername);
    
    // Set password_hash to empty string (NOT NULL constraint)
    updates.push('password_hash = ?');
    params.push('');
    
    // Email can be NULL (no NOT NULL constraint)
    updates.push('email = ?');
    params.push(null);
    
    if (hasPermissions) {
      updates.push('permissions = ?');
      params.push(null);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    // Log to activity_log table before revoking access
    if (session) {
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      // Determine entity type - if it's an employee (no username but has full_name), log as 'employee'
      const entityType = (!userToRevoke.username && userToRevoke.full_name) ? 'employee' : 'user';

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityType,
        userId,
        'delete',
        JSON.stringify({ username: userToRevoke.username || userToRevoke.full_name, full_name: userToRevoke.full_name, id: userId }),
        JSON.stringify(userToRevoke),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Remove user-store relationships (they no longer need store access)
    db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);

    // Log admin action
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertLog.run(
        session.userId,
        'admin_action',
        `Revoked user access: ${userToRevoke.username || userId}`,
        'user',
        userId,
        JSON.stringify({
          action: 'revoke_access',
          target_user_id: userId,
          target_username: userToRevoke.username,
          target_email: userToRevoke.email,
          target_role: userToRevoke.role
        })
      );
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    return c.json({ success: true });

  } catch (error: any) {
    console.error('Revoke user access error:', error);
    return c.json({ error: 'Failed to revoke user access' }, 500);
  }
});

// Also support query parameter version for backward compatibility
api.delete('/auth/users', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can delete users, or admin can delete cashiers from their store
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const userId = parseInt(id, 10);

    // Prevent revoking own account access
    if (userId === session.userId) {
      return c.json({ error: 'Cannot revoke your own account access' }, 400);
    }

    // Check if user exists
    const userToRevoke: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!userToRevoke) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Prevent revoking super_admin access
    if (userToRevoke.role === 'super_admin') {
      return c.json({ error: 'Cannot revoke super admin access' }, 403);
    }

    // Admin can revoke access for users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized - user not in your store' }, 403);
      }
    }

    // Check if permissions column exists
    const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
    const hasPermissions = userColumns.some(col => col.name === 'permissions');

    // Revoke user access: remove login credentials and permissions
    // Keep the employee record (full_name, role, etc.)
    const updates: string[] = [];
    const params: any[] = [];

    // Set username to a placeholder that ensures uniqueness (using timestamp + user ID)
    // This satisfies the NOT NULL and UNIQUE constraints
    const revokedUsername = `_revoked_${userId}_${Date.now()}`;
    updates.push('username = ?');
    params.push(revokedUsername);
    
    // Set password_hash to empty string (NOT NULL constraint)
    updates.push('password_hash = ?');
    params.push('');
    
    // Email can be NULL (no NOT NULL constraint)
    updates.push('email = ?');
    params.push(null);
    
    if (hasPermissions) {
      updates.push('permissions = ?');
      params.push(null);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    // Log to activity_log table before revoking access
    if (session) {
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      // Determine entity type - if it's an employee (no username but has full_name), log as 'employee'
      const entityType = (!userToRevoke.username && userToRevoke.full_name) ? 'employee' : 'user';

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityType,
        userId,
        'delete',
        JSON.stringify({ username: userToRevoke.username || userToRevoke.full_name, full_name: userToRevoke.full_name, id: userId }),
        JSON.stringify(userToRevoke),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Remove user-store relationships (they no longer need store access)
    db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);

    // Log admin action
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertLog.run(
        session.userId,
        'admin_action',
        `Revoked user access: ${userToRevoke.username || userId}`,
        'user',
        userId,
        JSON.stringify({
          action: 'revoke_access',
          target_user_id: userId,
          target_username: userToRevoke.username,
          target_email: userToRevoke.email,
          target_role: userToRevoke.role
        })
      );
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

    return c.json({ success: true, message: 'User access revoked successfully' });

  } catch (error: any) {
    console.error('Revoke user access error:', error);
    return c.json({ error: 'Failed to revoke user access' }, 500);
  }
});

// Get user analytics and activity logs
api.get('/users/:id/analytics', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can view user analytics
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const userId = parseInt(c.req.param('id'));
    if (!userId) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    // Check if user exists and has access
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Session is guaranteed to be non-null at this point
    const adminUserId = session.userId;

    // Admin can only view analytics for users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    // Get query parameters for period filtering
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    // Build date filter (only if dates are provided)
    let dateFilter = '';
    const dateParams: any[] = [];
    if (startDate) {
      dateFilter += ' AND DATE(s.created_at) >= DATE(?)';
      dateParams.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND DATE(s.created_at) <= DATE(?)';
      dateParams.push(endDate);
    }

    // Check if user_id column exists in sales table
    let salesTableHasUserId = false;
    try {
      const salesColumns: any[] = db.prepare('PRAGMA table_info(sales)').all();
      salesTableHasUserId = salesColumns.some((col: any) => col.name === 'user_id');
    } catch (e) {
      // Table might not exist
    }

    // Get sales statistics (only if user_id column exists)
    let salesStats: any = {
      total_sales: 0,
      total_revenue: 0,
      completed_revenue: 0,
      pending_revenue: 0,
      failed_revenue: 0,
      active_days: 0
    };
    let customerCount: any = { customers_served: 0 };

    if (salesTableHasUserId) {
      try {
        // Build query with proper parameter binding
        const salesQuery = `
          SELECT 
            COUNT(*) as total_sales,
            COALESCE(SUM(s.total_amount), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN s.payment_status = 'completed' THEN s.total_amount ELSE 0 END), 0) as completed_revenue,
            COALESCE(SUM(CASE WHEN s.payment_status = 'pending' THEN s.total_amount ELSE 0 END), 0) as pending_revenue,
            COALESCE(SUM(CASE WHEN s.payment_status = 'failed' THEN s.total_amount ELSE 0 END), 0) as failed_revenue,
            COUNT(DISTINCT DATE(s.created_at)) as active_days
          FROM sales s
          WHERE s.user_id = ? ${dateFilter}
        `;
        
        const salesResult: any = db.prepare(salesQuery).get(userId, ...dateParams);
        
        if (salesResult) {
          salesStats = {
            total_sales: salesResult.total_sales || 0,
            total_revenue: salesResult.total_revenue || 0,
            completed_revenue: salesResult.completed_revenue || 0,
            pending_revenue: salesResult.pending_revenue || 0,
            failed_revenue: salesResult.failed_revenue || 0,
            active_days: salesResult.active_days || 0
          };
        }

        const customerQuery = `
          SELECT COUNT(DISTINCT DATE(s.created_at)) as customers_served
          FROM sales s
          WHERE s.user_id = ? ${dateFilter}
        `;
        
        const customerResult: any = db.prepare(customerQuery).get(userId, ...dateParams);
        
        if (customerResult) {
          customerCount = customerResult;
        }
      } catch (e) {
        console.error('Error fetching sales stats:', e);
      }
    } else {
      // If no user_id column, derive stats from activity logs
      let logDateFilter = '';
      const logDateParams: any[] = [];
      if (startDate) {
        logDateFilter += ' AND DATE(created_at) >= DATE(?)';
        logDateParams.push(startDate);
      }
      if (endDate) {
        logDateFilter += ' AND DATE(created_at) <= DATE(?)';
        logDateParams.push(endDate);
      }
      
      const saleActivities: any[] = db.prepare(`
        SELECT metadata, created_at
        FROM user_activity_logs
        WHERE user_id = ? AND action_type = 'sale' ${logDateFilter}
      `).all(userId, ...logDateParams);
      
      salesStats.total_sales = saleActivities.length;
      salesStats.total_revenue = saleActivities.reduce((sum: number, act: any) => {
        try {
          const meta = act.metadata ? JSON.parse(act.metadata) : {};
          return sum + (parseFloat(meta.amount || 0));
        } catch {
          return sum;
        }
      }, 0);
      salesStats.completed_revenue = saleActivities.reduce((sum: number, act: any) => {
        try {
          const meta = act.metadata ? JSON.parse(act.metadata) : {};
          if (meta.payment_status === 'completed') {
            return sum + (parseFloat(meta.amount || 0));
          }
        } catch {}
        return sum;
      }, 0);
      salesStats.active_days = new Set(
        saleActivities.map((act: any) => act.created_at?.split(' ')[0]).filter(Boolean)
      ).size;
      customerCount.customers_served = salesStats.active_days;
    }

    // Get activity logs - include both logs by this user and logs about this user (as entity)
    const activityLogs: any[] = db.prepare(`
      SELECT 
        action_type,
        action_description,
        entity_type,
        entity_id,
        metadata,
        created_at,
        user_id as log_user_id
      FROM user_activity_logs
      WHERE user_id = ? OR (entity_type = 'user' AND entity_id = ?)
      ORDER BY created_at DESC
      LIMIT 100
    `).all(userId, userId);

    // Get top selling items (only if user_id column exists)
    let topItems: any[] = [];
    let paymentMethods: any[] = [];

    if (salesTableHasUserId) {
      try {
        topItems = db.prepare(`
          SELECT 
            COALESCE(p.name, srv.name, 'Service') as item_name,
            COALESCE(si.product_id, 0) as product_id,
            COALESCE(si.service_id, 0) as service_id,
            SUM(si.quantity) as total_quantity,
            SUM(si.total_price) as total_revenue
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          LEFT JOIN products p ON si.product_id = p.id
          LEFT JOIN services srv ON si.service_id = srv.id
          WHERE s.user_id = ? ${dateFilter}
          GROUP BY COALESCE(si.product_id, si.service_id)
          ORDER BY total_revenue DESC
          LIMIT 10
        `).all(userId, ...dateParams);

        paymentMethods = db.prepare(`
          SELECT 
            payment_method,
            COUNT(*) as count,
            COALESCE(SUM(total_amount), 0) as total_amount
          FROM sales
          WHERE user_id = ? ${dateFilter}
          GROUP BY payment_method
        `).all(userId, ...dateParams);
      } catch (e) {
        console.error('Error fetching top items/payment methods:', e);
      }
    } else {
      // Derive from activity logs
      const paymentActivities = db.prepare(`
        SELECT metadata
        FROM user_activity_logs
        WHERE user_id = ? AND action_type = 'payment'
        ${startDate ? 'AND created_at >= ?' : ''}
        ${endDate ? 'AND created_at <= ?' : ''}
      `).all(userId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate + ' 23:59:59'] : []));

      const paymentMap = new Map<string, { count: number; total: number }>();
      paymentActivities.forEach((act: any) => {
        try {
          const meta = act.metadata ? JSON.parse(act.metadata) : {};
          const method = meta.payment_method || 'cash';
          const amount = parseFloat(meta.amount || 0);
          const current = paymentMap.get(method) || { count: 0, total: 0 };
          paymentMap.set(method, { count: current.count + 1, total: current.total + amount });
        } catch {}
      });

      paymentMethods = Array.from(paymentMap.entries()).map(([method, data]) => ({
        payment_method: method,
        count: data.count,
        total_amount: data.total
      }));
    }

    return c.json({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        email: user.email,
        created_at: user.created_at
      },
      statistics: {
        total_sales: salesStats.total_sales || 0,
        total_revenue: parseFloat(salesStats.total_revenue || 0),
        completed_revenue: parseFloat(salesStats.completed_revenue || 0),
        pending_revenue: parseFloat(salesStats.pending_revenue || 0),
        failed_revenue: parseFloat(salesStats.failed_revenue || 0),
        customers_served: customerCount.customers_served || 0,
        active_days: salesStats.active_days || 0,
        average_sale_amount: salesStats.total_sales > 0 
          ? parseFloat(salesStats.total_revenue || 0) / salesStats.total_sales 
          : 0
      },
      top_items: topItems,
      payment_methods: paymentMethods,
      activity_logs: activityLogs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }))
    });

    // Log admin action for viewing user details
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertLog.run(
        adminUserId,
        'admin_action',
        `Viewed user details: ${user.username}`,
        'user',
        userId,
        JSON.stringify({
          action: 'view_details',
          target_user_id: userId,
          target_username: user.username
        })
      );
    } catch (logError) {
      console.error('Failed to log admin action:', logError);
    }

  } catch (error: any) {
    console.error('Get user analytics error:', error);
    return c.json({ error: 'Failed to get user analytics' }, 500);
  }
});

// Verify admin password for cashier price negotiation
api.post('/auth/verify-admin-password', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const { password, username } = await c.req.json();

    if (!password) {
      return c.json({ error: 'Password is required' }, 400);
    }

    // Get current user to check permissions
    const currentUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
    if (!currentUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if user has edit_prices permission
    let userPermissions: string[] = [];
    if (currentUser.permissions) {
      try {
        const parsed = typeof currentUser.permissions === 'string' 
          ? JSON.parse(currentUser.permissions) 
          : currentUser.permissions;
        userPermissions = Array.isArray(parsed) ? parsed : parsed.split(',').map((p: string) => p.trim());
      } catch (e) {
        try {
          userPermissions = currentUser.permissions.split(',').map((p: string) => p.trim());
        } catch {
          userPermissions = [];
        }
      }
    }
    const hasEditPricesPermission = userPermissions.includes('edit_prices');
    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';

    // If user has edit_prices permission or is admin, allow them to verify their own password
    if (hasEditPricesPermission || isAdmin) {
      // If username is provided and matches current user, verify their own password
      // OR if no username provided but user has permission, verify their own password
      if ((username && username === session.username) || (!username && (hasEditPricesPermission || isAdmin))) {
        const isValid = await verifyPassword(password, currentUser.password_hash);
        if (!isValid) {
          return c.json({ error: 'Invalid password' }, 401);
        }
        return c.json({ success: true, verified_user: currentUser.username });
      }
    }

    // For users without edit_prices permission, verify authorized user's password
    // If username is provided, verify that user's password (must have edit_prices permission)
    if (username && username !== session.username) {
      // Get the authorized user by username
      const authorizedUser: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      
      if (!authorizedUser) {
        return c.json({ error: 'Authorized user not found' }, 404);
      }

      // Check if authorized user has edit_prices permission or is admin
      let authUserPermissions: string[] = [];
      if (authorizedUser.permissions) {
        try {
          const parsed = typeof authorizedUser.permissions === 'string' 
            ? JSON.parse(authorizedUser.permissions) 
            : authorizedUser.permissions;
          authUserPermissions = Array.isArray(parsed) ? parsed : parsed.split(',').map((p: string) => p.trim());
        } catch (e) {
          try {
            authUserPermissions = authorizedUser.permissions.split(',').map((p: string) => p.trim());
          } catch {
            authUserPermissions = [];
          }
        }
      }
      const authUserHasEditPrices = authUserPermissions.includes('edit_prices');
      const authUserIsAdmin = authorizedUser.role === 'admin' || authorizedUser.role === 'super_admin';

      if (!authUserHasEditPrices && !authUserIsAdmin) {
        return c.json({ error: 'The specified user does not have permission to authorize price changes' }, 403);
      }

      // Check if authorized user is from the same store (for non-super-admin)
      if (session.storeId && authorizedUser.role !== 'super_admin') {
        const authUserStore: any = db.prepare(`
          SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
        `).get(authorizedUser.id, session.storeId);
        
        if (authUserStore.count === 0) {
          return c.json({ error: 'The authorized user must be from the same store' }, 403);
        }
      }

      // Verify password
      const isValid = await verifyPassword(password, authorizedUser.password_hash);

      if (!isValid) {
        return c.json({ error: 'Invalid password' }, 401);
      }

      return c.json({ 
        success: true, 
        verified_user: authorizedUser.username,
        verified_user_id: authorizedUser.id,
        verified_user_name: authorizedUser.full_name || authorizedUser.username
      });
    }

    // Fallback: For cashiers without edit_prices permission and no username provided, verify admin password from same store
    if (session.role === 'cashier' && !hasEditPricesPermission && !isAdmin && !username) {
      // Get admin user from the same store
      const admin: any = db.prepare(`
        SELECT u.* 
        FROM users u
        JOIN user_stores us ON u.id = us.user_id
        WHERE u.role IN ('admin', 'super_admin') 
        AND us.store_id = ?
        AND u.is_active = 1
        LIMIT 1
      `).get(session.storeId);

      if (!admin) {
        return c.json({ error: 'No admin found for this store' }, 404);
      }

      // Verify password
      const isValid = await verifyPassword(password, admin.password_hash);

      if (!isValid) {
        return c.json({ error: 'Invalid password' }, 401);
      }

      return c.json({ 
        success: true, 
        verified_user: admin.username,
        verified_user_id: admin.id,
        verified_user_name: admin.full_name || admin.username
      });
    }

    return c.json({ error: 'Unauthorized' }, 403);

  } catch (error: any) {
    console.error('Verify admin password error:', error);
    return c.json({ error: 'Failed to verify password' }, 500);
  }
});

// Verify current user's password (for admin actions)
api.post('/auth/verify-password', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const actionType = body.action_type || body.actionType || '';

    // For price changes, check for edit_prices permission
    if (actionType === 'change_price' || actionType === 'edit_price') {
      // Get user permissions
      const user: any = db.prepare('SELECT permissions FROM users WHERE id = ?').get(session.userId);
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      
      const permissions = user.permissions ? JSON.parse(user.permissions) : [];
      if (!permissions.includes('edit_prices') && session.role !== 'super_admin' && session.role !== 'admin') {
        return c.json({ error: 'Unauthorized: edit_prices permission required' }, 403);
      }
    } else {
      // For other actions, only super_admin and admin can verify their password
      if (session.role !== 'super_admin' && session.role !== 'admin') {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    const { username, password } = body;

    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }

    // Verify that the username matches the session user
    if (username !== session.username) {
      return c.json({ error: 'Username mismatch' }, 403);
    }

    // Get user from database
    const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      return c.json({ valid: false }, 200);
    }

    return c.json({ valid: true });

  } catch (error: any) {
    console.error('Verify password error:', error);
    return c.json({ error: 'Failed to verify password' }, 500);
  }
});

// Verify a super admin password during workstation boot mode selection
api.post('/auth/verify-super-admin-boot', async (c) => {
  try {
    const { password } = await c.req.json();
    if (!password) {
      return c.json({ error: 'Password is required' }, 400);
    }

    const superAdmins: any[] = db.prepare(`
      SELECT id, username, full_name, password_hash
      FROM users
      WHERE role = 'super_admin' AND is_active = 1
      ORDER BY id ASC
    `).all() as any[];

    if (!superAdmins || superAdmins.length === 0) {
      return c.json({ error: 'No active super admin found' }, 404);
    }

    for (const admin of superAdmins) {
      const ok = await verifyPassword(password, admin.password_hash);
      if (ok) {
        return c.json({
          success: true,
          verified_user: admin.username,
          verified_user_name: admin.full_name || admin.username,
        });
      }
    }

    return c.json({ error: 'Invalid password' }, 401);
  } catch (error: any) {
    console.error('Verify super admin boot password error:', error);
    return c.json({ error: 'Failed to verify password' }, 500);
  }
});

// Log authorization activity endpoint
api.post('/auth/log-authorization', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const { action_type, action_description, metadata } = await c.req.json();

    if (!action_type || !action_description) {
      return c.json({ error: 'Action type and description are required' }, 400);
    }

    // Log to user_activity_logs table
    try {
      db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        session.userId,
        'authorization',
        action_description,
        'authorization',
        null,
        JSON.stringify({
          authorized_action: action_type,
          ...metadata
        })
      );
    } catch (logError: any) {
      console.error('Failed to log authorization activity:', logError);
      // Don't fail the request if logging fails
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Log authorization error:', error);
    return c.json({ error: 'Failed to log authorization' }, 500);
  }
});

// Log authorization activity for a specific user (used when one user authorizes action for another)
api.post('/auth/log-authorization-for-user', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only admins can log activities for other users
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { user_id, action_type, action_description, metadata } = await c.req.json();

    if (!user_id || !action_type || !action_description) {
      return c.json({ error: 'User ID, action type and description are required' }, 400);
    }

    // Verify user exists
    const targetUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    if (!targetUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Log to user_activity_logs table for the specified user
    try {
      db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user_id,
        'authorization',
        action_description,
        'authorization',
        null,
        JSON.stringify({
          authorized_action: action_type,
          ...metadata
        })
      );
    } catch (logError: any) {
      console.error('Failed to log authorization activity:', logError);
      return c.json({ error: 'Failed to log authorization activity' }, 500);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Log authorization for user error:', error);
    return c.json({ error: 'Failed to log authorization' }, 500);
  }
});

// Download user activity logs
api.get('/users/:id/activity-logs/download', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can download activity logs
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const userId = parseInt(c.req.param('id'));
    const format = c.req.query('format') || 'csv';
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    if (!userId) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    // Verify user exists
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Admin can only download logs for users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    // Build date filter query
    let dateFilter = '';
    const dateParams: any[] = [];
    if (startDate) {
      dateFilter += ' AND DATE(created_at) >= DATE(?)';
      dateParams.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND DATE(created_at) <= DATE(?)';
      dateParams.push(endDate);
    }

    // Get activity logs for this user with date filter
    const logs: any[] = db.prepare(`
      SELECT * FROM user_activity_logs 
      WHERE user_id = ? ${dateFilter}
      ORDER BY created_at DESC
    `).all(userId, ...dateParams);

    if (format === 'csv') {
      const headers = ['ID', 'Action Type', 'Description', 'Entity Type', 'Entity ID', 'Created At', 'Metadata'];
      const csvData = logs.map(log => [
        log.id,
        log.action_type || '',
        log.action_description || '',
        log.entity_type || '',
        log.entity_id || '',
        log.created_at || '',
        log.metadata || ''
      ]);

      const content = [headers, ...csvData]
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const filename = `user_${userId}_activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
      const mimeType = 'text/csv;charset=utf-8;';
      
      return new Response(content, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } else {
      // For JSON format, return JSON response (not file download)
      return c.json(logs);
    }
  } catch (error: any) {
    console.error('Download activity logs error:', error);
    return c.json({ error: 'Failed to download activity logs' }, 500);
  }
});

// Clear user activity logs
api.delete('/users/:id/activity-logs', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can clear activity logs
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const userId = parseInt(c.req.param('id'));

    if (!userId) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    // Verify user exists
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Admin can only clear logs for users from their store
    if (session.role === 'admin') {
      const userStore: any = db.prepare(`
        SELECT COUNT(*) as count FROM user_stores WHERE user_id = ? AND store_id = ?
      `).get(userId, session.storeId);
      
      if (userStore.count === 0) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    // Delete activity logs for this user
    db.prepare('DELETE FROM user_activity_logs WHERE user_id = ?').run(userId);

    return c.json({ success: true, message: 'Activity logs cleared successfully' });
  } catch (error: any) {
    console.error('Clear activity logs error:', error);
    return c.json({ error: 'Failed to clear activity logs' }, 500);
  }
});

// Download all users activity logs
api.get('/users/activity-logs/download', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin and admin can download all activity logs
    if (session.role !== 'super_admin' && session.role !== 'admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const format = c.req.query('format') || 'csv';
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    // Build date filter query
    let dateFilter = '';
    const dateParams: any[] = [];
    if (startDate) {
      dateFilter += ' AND DATE(ual.created_at) >= DATE(?)';
      dateParams.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND DATE(ual.created_at) <= DATE(?)';
      dateParams.push(endDate);
    }

    // Get activity logs for all users (filtered by store for admin)
    let logs: any[];
    if (session.role === 'admin' && session.storeId) {
      // Admin can only see logs for users from their store
      logs = db.prepare(`
        SELECT ual.*, u.username, u.full_name
        FROM user_activity_logs ual
        JOIN users u ON ual.user_id = u.id
        JOIN user_stores us ON u.id = us.user_id
        WHERE us.store_id = ? ${dateFilter}
        ORDER BY ual.created_at DESC
      `).all(session.storeId, ...dateParams);
    } else {
      // Super admin can see all logs
      logs = db.prepare(`
        SELECT ual.*, u.username, u.full_name
        FROM user_activity_logs ual
        JOIN users u ON ual.user_id = u.id
        WHERE 1=1 ${dateFilter}
        ORDER BY ual.created_at DESC
      `).all(...dateParams);
    }

    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'csv') {
      const headers = ['ID', 'User ID', 'Username', 'Full Name', 'Action Type', 'Description', 'Entity Type', 'Entity ID', 'Created At', 'Metadata'];
      const csvData = logs.map(log => [
        log.id,
        log.user_id,
        log.username || '',
        log.full_name || '',
        log.action_type || '',
        log.action_description || '',
        log.entity_type || '',
        log.entity_id || '',
        log.created_at || '',
        log.metadata || ''
      ]);

      content = [headers, ...csvData]
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      filename = `all_users_activity_logs_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv;charset=utf-8;';
      
      return new Response(content, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } else {
      // For JSON format, return JSON response (not file download)
      return c.json(logs);
    }
  } catch (error: any) {
    console.error('Download all activity logs error:', error);
    return c.json({ error: 'Failed to download activity logs' }, 500);
  }
});

// Clear all users activity logs
api.delete('/users/activity-logs', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can clear all activity logs
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Delete all activity logs
    db.prepare('DELETE FROM user_activity_logs').run();

    return c.json({ success: true, message: 'All activity logs cleared successfully' });
  } catch (error: any) {
    console.error('Clear all activity logs error:', error);
    return c.json({ error: 'Failed to clear activity logs' }, 500);
  }
});

// Log user activity
api.post('/users/log-activity', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const { action_type, action_description, entity_type, entity_id, metadata } = await c.req.json();

    if (!action_type || !action_description) {
      return c.json({ error: 'Action type and description are required' }, 400);
    }

    // Insert activity log
    try {
      const insertLog = db.prepare(`
        INSERT INTO user_activity_logs (user_id, action_type, action_description, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertLog.run(
        session.userId,
        action_type,
        action_description,
        entity_type || null,
        entity_id || null,
        metadata || null
      );

      return c.json({ success: true });
    } catch (logError) {
      console.error('Failed to insert activity log:', logError);
      return c.json({ error: 'Failed to log activity' }, 500);
    }
  } catch (error: any) {
    console.error('Log activity error:', error);
    return c.json({ error: 'Failed to log activity' }, 500);
  }
});

// Stores routes
api.get('/stores', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can view all stores
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Check if products and services tables have store_id column
    const productColumns = db.prepare("PRAGMA table_info(products)").all() as any[];
    const serviceColumns = db.prepare("PRAGMA table_info(services)").all() as any[];
    const hasProductStoreId = productColumns.some(col => col.name === 'store_id');
    const hasServiceStoreId = serviceColumns.some(col => col.name === 'store_id');
    
    // Build query based on whether store_id exists
    let stores;
    if (hasProductStoreId && hasServiceStoreId) {
      stores = db.prepare(`
        SELECT s.*, 
               COUNT(DISTINCT us.user_id) as user_count,
               COUNT(DISTINCT p.id) as product_count,
               COUNT(DISTINCT sv.id) as service_count
        FROM stores s
        LEFT JOIN user_stores us ON s.id = us.store_id
        LEFT JOIN products p ON s.id = p.store_id
        LEFT JOIN services sv ON s.id = sv.store_id
        WHERE s.is_active = 1
        GROUP BY s.id
        ORDER BY s.name ASC
      `).all();
    } else if (hasProductStoreId) {
      stores = db.prepare(`
        SELECT s.*, 
               COUNT(DISTINCT us.user_id) as user_count,
               COUNT(DISTINCT p.id) as product_count,
               0 as service_count
        FROM stores s
        LEFT JOIN user_stores us ON s.id = us.store_id
        LEFT JOIN products p ON s.id = p.store_id
        WHERE s.is_active = 1
        GROUP BY s.id
        ORDER BY s.name ASC
      `).all();
    } else {
      stores = db.prepare(`
        SELECT s.*, 
               COUNT(DISTINCT us.user_id) as user_count,
               0 as product_count,
               0 as service_count
        FROM stores s
        LEFT JOIN user_stores us ON s.id = us.store_id
        WHERE s.is_active = 1
        GROUP BY s.id
        ORDER BY s.name ASC
      `).all();
    }

    return c.json({ stores });

  } catch (error: any) {
    console.error('Get stores error:', error);
    return c.json({ error: 'Failed to get stores' }, 500);
  }
});

api.post('/stores', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can create stores
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { name, address, phone, email } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Store name is required' }, 400);
    }

    // Create store
    const result = db.prepare(`
      INSERT INTO stores (name, address, phone, email)
      VALUES (?, ?, ?, ?)
    `).run(name, address || null, phone || null, email || null);

    const storeId = result.lastInsertRowid;

    // Get created store
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);

    return c.json({ success: true, store });

  } catch (error: any) {
    console.error('Create store error:', error);
    if (error.message?.includes('UNIQUE')) {
      return c.json({ error: 'Store name already exists' }, 400);
    }
    return c.json({ error: 'Failed to create store' }, 500);
  }
});

api.put('/stores', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can update stores
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const { id, name, address, phone, email, isActive } = await c.req.json();

    if (!id) {
      return c.json({ error: 'Store ID is required' }, 400);
    }

    // Get original store data before update for activity log
    const originalStore = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as any;
    
    if (!originalStore) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Update store
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`
        UPDATE stores SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // Get updated store
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);

    // Log activity after update
    if (session && updates.length > 0) {
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      const modifiedStore = { ...originalStore, name, address, phone, email, is_active: isActive !== undefined ? (isActive ? 1 : 0) : originalStore.is_active };

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, modified_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'store',
        id,
        'update',
        JSON.stringify({ name: name || originalStore.name, id }),
        JSON.stringify(originalStore),
        JSON.stringify(modifiedStore),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    return c.json({ success: true, store });

  } catch (error: any) {
    console.error('Update store error:', error);
    if (error.message?.includes('UNIQUE')) {
      return c.json({ error: 'Store name already exists' }, 400);
    }
    return c.json({ error: 'Failed to update store' }, 500);
  }
});

api.delete('/stores', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can delete stores
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'Store ID is required' }, 400);
    }

    // Get store data before deletion for activity log
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as any;
    
    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Log activity before deletion
    if (session) {
      ensureActivityLogTable();
      const retention = getRetentionDays();
      const permanentDeleteAt = new Date();
      permanentDeleteAt.setDate(permanentDeleteAt.getDate() + retention);

      db.prepare(`
        INSERT INTO activity_log (entity_type, entity_id, action_type, action_data, deleted_data, performed_by, permanent_delete_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'store',
        id,
        'delete',
        JSON.stringify({ name: store.name, id }),
        JSON.stringify(store),
        session.userId,
        permanentDeleteAt.toISOString()
      );
    }

    // Delete store (cascade will handle related records)
    db.prepare('DELETE FROM stores WHERE id = ?').run(id);

    return c.json({ success: true });

  } catch (error: any) {
    console.error('Delete store error:', error);
    return c.json({ error: 'Failed to delete store' }, 500);
  }
});

// Get store details endpoint
api.get('/stores/:id/details', async (c) => {
  try {
    // Get token from cookie header
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can view store details
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const storeId = parseInt(c.req.param('id'));

    if (!storeId) {
      return c.json({ error: 'Store ID is required' }, 400);
    }

    // Get store info
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
    
    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Check if products and services have store_id
    const productColumns = db.prepare("PRAGMA table_info(products)").all() as any[];
    const serviceColumns = db.prepare("PRAGMA table_info(services)").all() as any[];
    const hasProductStoreId = productColumns.some(col => col.name === 'store_id');
    const hasServiceStoreId = serviceColumns.some(col => col.name === 'store_id');

    // Get products for this store
    let products: any[] = [];
    if (hasProductStoreId) {
      products = db.prepare(`
        SELECT id, name, price, stock_quantity, category, created_at
        FROM products
        WHERE store_id = ?
        ORDER BY name ASC
      `).all(storeId) as any[];
    }

    // Get services for this store
    let services: any[] = [];
    if (hasServiceStoreId) {
      services = db.prepare(`
        SELECT id, name, category, price, price_type, created_at
        FROM services
        WHERE store_id = ?
        ORDER BY name ASC
      `).all(storeId) as any[];
    }

    // Get employees (users) for this store
    // Check if users table has salary, work_shift, hire_date columns
    const userColumns = db.prepare("PRAGMA table_info(users)").all() as any[];
    const hasSalary = userColumns.some(col => col.name === 'salary');
    const hasWorkShift = userColumns.some(col => col.name === 'work_shift');
    const hasHireDate = userColumns.some(col => col.name === 'hire_date');
    
    let employeeFields = 'u.id, u.username, u.full_name, u.email, u.role, u.is_active, u.created_at, us.is_primary';
    if (hasSalary) employeeFields += ', u.salary';
    if (hasWorkShift) employeeFields += ', u.work_shift';
    if (hasHireDate) employeeFields += ', u.hire_date';
    
    const employees = db.prepare(`
      SELECT ${employeeFields}
      FROM users u
      JOIN user_stores us ON u.id = us.user_id
      WHERE us.store_id = ?
      ORDER BY us.is_primary DESC, u.role ASC, u.full_name ASC
    `).all(storeId) as any[];

    // Get sales statistics for this store
    // Check if sales table has store_id column
    const salesColumns = db.prepare("PRAGMA table_info(sales)").all() as any[];
    const hasSalesStoreId = salesColumns.some(col => col.name === 'store_id');
    
    let salesStats: any = { total_sales: 0, total_revenue: 0, active_days: 0 };
    if (hasSalesStoreId) {
      salesStats = db.prepare(`
        SELECT 
          COUNT(*) as total_sales,
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM sales
        WHERE store_id = ?
      `).get(storeId) as any;
    }

    // Get product sales statistics for this store
    let productSales: any[] = [];
    if (hasSalesStoreId && hasProductStoreId) {
      // Check if sale_items table has product_id
      const saleItemsColumns = db.prepare("PRAGMA table_info(sale_items)").all() as any[];
      const hasProductIdInSaleItems = saleItemsColumns.some(col => col.name === 'product_id');
      
      if (hasProductIdInSaleItems) {
        // Build query based on whether products table has store_id
        let productSalesQuery = '';
        let productSalesParams: any[] = [];
        
        if (hasProductStoreId) {
          // Products have store_id - filter by store
          productSalesQuery = `
            SELECT 
              p.id,
              p.name,
              p.category,
              COALESCE(SUM(si.quantity), 0) as total_quantity_sold,
              COALESCE(SUM(si.total_price), 0) as total_revenue,
              COUNT(DISTINCT s.id) as sale_count
            FROM products p
            LEFT JOIN sale_items si ON p.id = si.product_id
            LEFT JOIN sales s ON si.sale_id = s.id AND s.store_id = ?
            WHERE p.store_id = ? OR (p.store_id IS NULL AND s.store_id = ?)
            GROUP BY p.id, p.name, p.category
            HAVING total_quantity_sold > 0
            ORDER BY total_revenue DESC, total_quantity_sold DESC
          `;
          productSalesParams = [storeId, storeId, storeId];
        } else {
          // Products don't have store_id - filter by sales only
          productSalesQuery = `
            SELECT 
              p.id,
              p.name,
              p.category,
              COALESCE(SUM(si.quantity), 0) as total_quantity_sold,
              COALESCE(SUM(si.total_price), 0) as total_revenue,
              COUNT(DISTINCT s.id) as sale_count
            FROM products p
            LEFT JOIN sale_items si ON p.id = si.product_id
            LEFT JOIN sales s ON si.sale_id = s.id AND s.store_id = ?
            WHERE si.product_id IS NOT NULL
            GROUP BY p.id, p.name, p.category
            HAVING total_quantity_sold > 0
            ORDER BY total_revenue DESC, total_quantity_sold DESC
          `;
          productSalesParams = [storeId];
        }
        
        productSales = db.prepare(productSalesQuery).all(...productSalesParams) as any[];
      }
    }

    // Get service sales statistics for this store
    let serviceSales: any[] = [];
    if (hasSalesStoreId && hasServiceStoreId) {
      // Check if sale_items table has service_id
      const saleItemsColumns = db.prepare("PRAGMA table_info(sale_items)").all() as any[];
      const hasServiceIdInSaleItems = saleItemsColumns.some(col => col.name === 'service_id');
      
      if (hasServiceIdInSaleItems) {
        serviceSales = db.prepare(`
          SELECT 
            sv.id,
            sv.name,
            sv.category,
            COALESCE(SUM(si.quantity), 0) as total_quantity_sold,
            COALESCE(SUM(si.total_price), 0) as total_revenue,
            COUNT(DISTINCT s.id) as sale_count
          FROM services sv
          LEFT JOIN sale_items si ON sv.id = si.service_id AND si.service_id IS NOT NULL
          LEFT JOIN sales s ON si.sale_id = s.id AND s.store_id = ?
          WHERE sv.store_id = ?
          GROUP BY sv.id, sv.name, sv.category
          HAVING COALESCE(SUM(si.quantity), 0) > 0
          ORDER BY total_revenue DESC, total_quantity_sold DESC
        `).all(storeId, storeId) as any[];
      }
    }

    return c.json({
      store,
      products,
      services,
      employees,
      sales_stats: salesStats || { total_sales: 0, total_revenue: 0, active_days: 0 },
      product_sales: productSales,
      service_sales: serviceSales
    });

  } catch (error: any) {
    console.error('Get store details error:', error);
    return c.json({ error: 'Failed to get store details' }, 500);
  }
});

// Activity Log routes
api.get('/activity-log', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    // Only super_admin can access activity log
    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Get query parameter - Hono uses c.req.query() for query params
    const typeParam = c.req.query('type');
    const type = typeParam || 'all';
    ensureActivityLogTable();
    ensureActivityLogSettingsTable();
    const retention = getRetentionDays();
    const permanentDeleteDate = new Date();
    permanentDeleteDate.setDate(permanentDeleteDate.getDate() + retention);

    let query = `
      SELECT al.*, 
             u.username as performed_by_username,
             u.full_name as performed_by_name
      FROM activity_log al
      LEFT JOIN users u ON al.performed_by = u.id
      WHERE (al.permanent_delete_at > datetime('now') OR al.permanent_delete_at IS NULL)
    `;

    if (type === 'deleted') {
      query += ` AND al.action_type = 'delete' AND (al.is_undone = 0 OR al.is_undone IS NULL)`;
    } else if (type === 'modified') {
      query += ` AND al.action_type = 'update' AND (al.is_undone = 0 OR al.is_undone IS NULL)`;
    } else if (type === 'create') {
      query += ` AND al.action_type = 'create' AND (al.is_undone = 0 OR al.is_undone IS NULL)`;
    } else if (type === 'return') {
      query += ` AND al.action_type = 'return' AND (al.is_undone = 0 OR al.is_undone IS NULL)`;
    } else {
      query += ` AND (al.is_undone = 0 OR al.is_undone IS NULL)`;
    }
    

    query += ` ORDER BY al.performed_at DESC`;

    const logs = db.prepare(query).all() as any[];

    // Enrich logs with entity names based on entity_type
    const enrichedLogs = logs.map(log => {
      let entityName: string | null = null;
      
      try {
        // Try to get entity name from action_data first
        if (log.action_data) {
          const actionData = JSON.parse(log.action_data);
          entityName = actionData.name || actionData.title || actionData.full_name || actionData.username || null;
        }
        
        // If not found in action_data, query the database based on entity_type
        if (!entityName && log.entity_id) {
          switch (log.entity_type) {
            case 'product':
              const product: any = db.prepare('SELECT name FROM products WHERE id = ?').get(log.entity_id);
              entityName = product?.name || null;
              break;
            case 'service':
              const service: any = db.prepare('SELECT name FROM services WHERE id = ?').get(log.entity_id);
              entityName = service?.name || null;
              break;
            case 'user':
            case 'employee':
              const user: any = db.prepare('SELECT full_name, username FROM users WHERE id = ?').get(log.entity_id);
              entityName = user?.full_name || user?.username || null;
              break;
            case 'expense':
              const expense: any = db.prepare('SELECT title FROM expenses WHERE id = ?').get(log.entity_id);
              entityName = expense?.title || null;
              break;
            case 'store':
              const store: any = db.prepare('SELECT name FROM stores WHERE id = ?').get(log.entity_id);
              entityName = store?.name || null;
              break;
            case 'sale_return':
              const saleReturn: any = db.prepare('SELECT id FROM returns WHERE id = ?').get(log.entity_id);
              if (saleReturn) {
                entityName = `Return #${log.entity_id}`;
              } else {
                entityName = null;
              }
              break;
          }
        }
      } catch (error) {
        console.error('Error enriching log with entity name:', error);
      }
      
      return {
        ...log,
        entity_name: entityName
      };
    });

    // Calculate permanent_delete_at for each log
    const logsWithDeleteDate = enrichedLogs.map(log => {
      if (!log.permanent_delete_at) {
        const deleteDate = new Date(log.performed_at);
        deleteDate.setDate(deleteDate.getDate() + retention);
        log.permanent_delete_at = deleteDate.toISOString();
      }
      return log;
    });

    return c.json(logsWithDeleteDate);
  } catch (error: any) {
    console.error('Activity log fetch error:', error);
    return c.json({ error: 'Failed to fetch activity log' }, 500);
  }
});

api.get('/activity-log/settings', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    ensureActivityLogSettingsTable();
    const settings = db.prepare('SELECT setting_key, setting_value FROM activity_log_settings').all() as any[];
    const settingsObj: any = {};
    settings.forEach(s => {
      settingsObj[s.setting_key] = s.setting_value;
    });

    return c.json(settingsObj);
  } catch (error: any) {
    console.error('Activity log settings fetch error:', error);
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

api.put('/activity-log/settings', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    ensureActivityLogSettingsTable();
    const { retention_days, alert_days_before } = await c.req.json();

    if (retention_days) {
      db.prepare(`
        INSERT INTO activity_log_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = datetime('now')
      `).run('retention_days', retention_days.toString());
    }

    if (alert_days_before) {
      db.prepare(`
        INSERT INTO activity_log_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = datetime('now')
      `).run('alert_days_before', alert_days_before.toString());
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Activity log settings update error:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

api.post('/activity-log/:id/undo', async (c) => {
  try {
    const token = c.get('posSessionToken');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = getSession(token);
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (session.role !== 'super_admin') {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const logId = parseInt(c.req.param('id'));
    ensureActivityLogTable();
    const log = db.prepare('SELECT * FROM activity_log WHERE id = ?').get(logId) as any;

    if (!log) {
      return c.json({ error: 'Activity log entry not found' }, 404);
    }

    if (log.is_undone) {
      return c.json({ error: 'This action has already been undone' }, 400);
    }

    // Restore deleted item or revert modification
    if (log.action_type === 'delete' && log.deleted_data) {
      const deletedData = JSON.parse(log.deleted_data);
      const entityType = log.entity_type;

      // Restore based on entity type
      if (entityType === 'user' || entityType === 'employee') {
        // Restore user/employee - need to restore username, email, password_hash, and permissions
        const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
        const hasPermissions = userColumns.some(col => col.name === 'permissions');
        
        const updates: string[] = [];
        const params: any[] = [];
        
        if (deletedData.username) {
          updates.push('username = ?');
          params.push(deletedData.username);
        }
        if (deletedData.email) {
          updates.push('email = ?');
          params.push(deletedData.email);
        }
        if (deletedData.password_hash) {
          updates.push('password_hash = ?');
          params.push(deletedData.password_hash);
        }
        if (hasPermissions && deletedData.permissions) {
          updates.push('permissions = ?');
          params.push(deletedData.permissions);
        }
        if (deletedData.full_name) {
          updates.push('full_name = ?');
          params.push(deletedData.full_name);
        }
        if (deletedData.role) {
          updates.push('role = ?');
          params.push(deletedData.role);
        }
        if (deletedData.salary !== undefined) {
          updates.push('salary = ?');
          params.push(deletedData.salary);
        }
        if (deletedData.work_shift !== undefined) {
          updates.push('work_shift = ?');
          params.push(deletedData.work_shift);
        }
        if (deletedData.hire_date !== undefined) {
          updates.push('hire_date = ?');
          params.push(deletedData.hire_date);
        }
        
        if (updates.length > 0) {
          updates.push('updated_at = CURRENT_TIMESTAMP');
          params.push(log.entity_id);
          db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
        
        // Restore user-store relationships if they existed
        // Note: We don't store user_stores in deleted_data, so this would need to be handled separately
        // For now, we'll just restore the user record
      } else if (entityType === 'product') {
        db.prepare(`
          INSERT INTO products (id, name, barcode, price, stock_quantity, min_stock_level, category, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          deletedData.id,
          deletedData.name,
          deletedData.barcode,
          deletedData.price,
          deletedData.stock_quantity,
          deletedData.min_stock_level,
          deletedData.category,
          deletedData.description,
          deletedData.created_at,
          deletedData.updated_at
        );
      } else if (entityType === 'service') {
        db.prepare(`
          INSERT INTO services (id, name, category, price, price_type, price_config, description, duration, features, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          deletedData.id,
          deletedData.name,
          deletedData.category,
          deletedData.price,
          deletedData.price_type,
          deletedData.price_config,
          deletedData.description,
          deletedData.duration,
          deletedData.features,
          deletedData.created_at,
          deletedData.updated_at
        );
      } else if (entityType === 'expense') {
        db.prepare(`
          INSERT INTO expenses (id, title, description, category, amount, date, period_start, period_end, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          deletedData.id,
          deletedData.title,
          deletedData.description,
          deletedData.category,
          deletedData.amount,
          deletedData.date,
          deletedData.period_start,
          deletedData.period_end,
          deletedData.notes,
          deletedData.created_at,
          deletedData.updated_at
        );
      }
    } else if (log.action_type === 'update' && log.deleted_data && log.modified_data) {
      const originalData = JSON.parse(log.deleted_data);
      const entityType = log.entity_type;

      // Revert to original data
      if (entityType === 'user' || entityType === 'employee') {
        const userColumns = db.prepare('PRAGMA table_info(users)').all() as any[];
        const hasPermissions = userColumns.some(col => col.name === 'permissions');
        
        const updates: string[] = [];
        const params: any[] = [];
        
        if (originalData.username !== undefined) {
          updates.push('username = ?');
          params.push(originalData.username);
        }
        if (originalData.email !== undefined) {
          updates.push('email = ?');
          params.push(originalData.email);
        }
        if (originalData.full_name !== undefined) {
          updates.push('full_name = ?');
          params.push(originalData.full_name);
        }
        if (originalData.role !== undefined) {
          updates.push('role = ?');
          params.push(originalData.role);
        }
        if (originalData.is_active !== undefined) {
          updates.push('is_active = ?');
          params.push(originalData.is_active);
        }
        if (hasPermissions && originalData.permissions !== undefined) {
          updates.push('permissions = ?');
          params.push(originalData.permissions);
        }
        if (originalData.salary !== undefined) {
          updates.push('salary = ?');
          params.push(originalData.salary);
        }
        if (originalData.work_shift !== undefined) {
          updates.push('work_shift = ?');
          params.push(originalData.work_shift);
        }
        if (originalData.hire_date !== undefined) {
          updates.push('hire_date = ?');
          params.push(originalData.hire_date);
        }
        
        if (updates.length > 0) {
          updates.push('updated_at = CURRENT_TIMESTAMP');
          params.push(log.entity_id);
          db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
      } else if (entityType === 'product') {
        db.prepare(`
          UPDATE products SET
            name = ?, barcode = ?, price = ?, stock_quantity = ?, min_stock_level = ?, category = ?, description = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          originalData.name,
          originalData.barcode,
          originalData.price,
          originalData.stock_quantity,
          originalData.min_stock_level,
          originalData.category,
          originalData.description,
          log.entity_id
        );
      } else if (entityType === 'service') {
        db.prepare(`
          UPDATE services SET
            name = ?, category = ?, price = ?, price_type = ?, price_config = ?, description = ?, duration = ?, features = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          originalData.name,
          originalData.category,
          originalData.price,
          originalData.price_type,
          originalData.price_config,
          originalData.description,
          originalData.duration,
          originalData.features,
          log.entity_id
        );
      } else if (entityType === 'expense') {
        db.prepare(`
          UPDATE expenses SET
            title = ?, description = ?, category = ?, amount = ?, date = ?, period_start = ?, period_end = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          originalData.title,
          originalData.description,
          originalData.category,
          originalData.amount,
          originalData.date,
          originalData.period_start,
          originalData.period_end,
          originalData.notes,
          log.entity_id
        );
      }
    }

    // Mark as undone
    db.prepare(`
      UPDATE activity_log SET
        is_undone = 1,
        undone_at = datetime('now')
      WHERE id = ?
    `).run(logId);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Undo action error:', error);
    return c.json({ error: 'Failed to undo action' }, 500);
  }
});

export { api, API_BASENAME };

