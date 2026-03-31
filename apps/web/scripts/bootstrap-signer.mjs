#!/usr/bin/env node
/**
 * Offline bootstrap signer tool (.mjs so it runs without a parent package.json "type":"module").
 *
 * Usage (activation):
 *   node scripts/bootstrap-signer.mjs --request "<requestCode>" --private-key "C:\\keys\\bootstrap_ed25519_private.pem" --expires-hours 24 --allow-server true
 *
 * Usage (super admin password reset; request from POST /api/bootstrap/superadmin-password-reset/request):
 *   node scripts/bootstrap-signer.mjs --request "<requestCode>" --private-key "..." --expires-hours 2 --mode superadmin-password-reset
 *   Optional if multiple super admins: --target-username superadmin
 *
 * Output:
 *   payload_base64url.signature_base64url
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[k] = v;
  }
  return out;
}

function b64uDecode(s) {
  return Buffer.from(String(s || ''), 'base64url').toString('utf8');
}

function b64uEncode(s) {
  return Buffer.from(String(s || ''), 'utf8').toString('base64url');
}

function fail(msg) {
  console.error(`bootstrap-signer: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
const requestCode = String(args.request || '').trim();
const privateKeyPath = String(args['private-key'] || process.env.BOOTSTRAP_PRIVATE_KEY_PATH || '').trim();
const keyId = String(args['key-id'] || 'k1').trim();
const expiresHoursRaw = String(args['expires-hours'] || '').trim();
const noExpiry = String(args['no-expiry'] || 'false').toLowerCase() === 'true';
const allowServer = String(args['allow-server'] || 'true').toLowerCase() === 'true';
const allowClient = String(args['allow-client'] || 'true').toLowerCase() === 'true';
const mode = String(args.mode || '').trim().toLowerCase();
const targetUsername = String(args['target-username'] || '').trim();

if (!requestCode) fail('missing --request');
if (!privateKeyPath) fail('missing --private-key (or BOOTSTRAP_PRIVATE_KEY_PATH)');
if (!fs.existsSync(privateKeyPath)) fail(`private key not found: ${privateKeyPath}`);

let req;
try {
  req = JSON.parse(b64uDecode(requestCode));
} catch {
  fail('invalid request code');
}

if (!req?.machine_id || !req?.nonce || !req?.product_id) {
  fail('request payload missing machine_id/nonce/product_id');
}

let expiresAt = null;
if (!noExpiry) {
  const h = Number(expiresHoursRaw || 24);
  if (!Number.isFinite(h) || h <= 0) fail('invalid --expires-hours');
  expiresAt = Math.floor(Date.now() / 1000 + h * 3600);
}

const purpose = String(req.purpose || '').trim();
if (mode === 'superadmin-password-reset' && purpose !== 'superadmin_password_reset') {
  fail('use request code from POST /api/bootstrap/superadmin-password-reset/request');
}

let payload;
if (purpose === 'superadmin_password_reset') {
  payload = {
    machine_id: String(req.machine_id),
    product_id: String(req.product_id),
    request_nonce: String(req.nonce),
    allow_superadmin_password_reset: true,
    expires_at: expiresAt,
    key_id: keyId,
    issued_at: Math.floor(Date.now() / 1000),
  };
  if (targetUsername) {
    payload.target_username = targetUsername;
  }
} else {
  payload = {
    machine_id: String(req.machine_id),
    product_id: String(req.product_id),
    request_nonce: String(req.nonce),
    allow_install: true,
    features: {
      client: allowClient,
      server: allowServer,
    },
    expires_at: expiresAt,
    key_id: keyId,
    issued_at: Math.floor(Date.now() / 1000),
  };
}

const payloadPart = b64uEncode(JSON.stringify(payload));
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const signature = crypto.sign(null, Buffer.from(payloadPart, 'utf8'), crypto.createPrivateKey(privateKeyPem));
const token = `${payloadPart}.${signature.toString('base64url')}`;

console.log(token);
