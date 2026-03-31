# LAN / multi-PC deployment (EXE installs)

The POS can run as:

1. **Server** — This PC runs the embedded API + SQLite (one database per shop).
2. **Client** — This PC only runs the UI; all API calls go to another machine’s URL.

Configure this under **Admin → Network** (super admin). Settings are stored in this browser / WebView (`localStorage`).

## Roles

| Mode | API base URL | Use case |
|------|----------------|----------|
| **Server** | Empty (same origin) | The machine that stores the live database. |
| **Client** | `http://&lt;server-LAN-IP&gt;:&lt;port&gt;` | Extra registers, back office, etc. |

Switching to **Server** clears any remote URL so this install talks to its own API.

## Ports & firewall (Windows)

On the **server** PC, allow inbound:

- **TCP** — HTTP port your app uses (default dev: **4000**; production matches your build).
- **UDP** — **48123** (LAN discovery beacon; Tauri clients broadcast here).

Discovery also runs an **HTTP scan** across common subnets (`/api/health`), which can be slower but works without UDP.

## Finding the server automatically

1. Open **Admin → Network**.
2. Set **HTTP port to scan** to match the server (often **4000**).
3. Click **Scan network**.

- **Tauri (installed .exe):** sends a UDP probe; machines running the POS API reply with their `http://&lt;LAN-IP&gt;:&lt;port&gt;`.
- **Any client:** parallel HTTP scan on likely subnets (WebRTC helps narrow the subnet when possible).

Pick **Use this server** to save URL and switch to **Client** mode.

## Manual URL

If discovery finds nothing:

1. On the **server** PC, note its LAN IP (`ipconfig`).
2. On each **client**, set **API server URL** to `http://&lt;IP&gt;:&lt;port&gt;` (no trailing slash), **Test connection**, **Save URL**.

## Technical keys

| Key | Purpose |
|-----|---------|
| `POS_API_BASE_URL` | Remote API origin, or empty for same-origin |
| `POS_DEPLOYMENT_MODE` | `server` or `client` |
| `POS_DISCOVERY_HTTP_PORT` | Port used for HTTP subnet scan (default 4000) |

Health check: `GET /api/health` → `{ "ok": true, "service": "pos-api", ... }`.

## This app’s URL (Network page)

`GET /api/server-info` returns:

- `port` — HTTP port the Node server recorded (see global `__POS_HTTP_PORT__` set at startup).
- `lanIPv4` — first non-loopback IPv4 on this machine.
- `suggestedLanUrl` — `http://<lanIPv4>:<port>` for **client** API base URL on other PCs.
- `pageUrl` — `proto://Host` from the current request (often `localhost` when browsing on the server).

The **Admin → Network** page shows these for copy/paste setup.

## Payments (super admin)

**Admin → Payments** stores Daraja (M-Pesa) and Stripe fields in `app_settings.payment_config` (`GET/PUT /api/admin/payment-settings`).  
Daraja runtime uses **database values first**, then falls back to environment variables. Card/Stripe keys are stored for future checkout integration.

## Shop theme (clients follow server)

- The active theme is stored in the **server database** (`app_settings.active_theme`).
- **`GET /api/theme`** — public JSON `{ theme, updatedAt }` (no login). Client PCs load this on startup and when the tab becomes visible again.
- **`PUT /api/theme`** — admin/super_admin only; saved when an admin applies a theme on **Admin → Themes** (same as before, plus server sync).
- **Client mode** always prefers the server theme over a stale `localStorage` copy; background image paths are rewritten to the API base URL so assets load from the server.

## EXE / Tauri notes

- The dev server uses **port 4000** (`vite.config.ts`). Production may differ; align **discovery port** with the real server port.
- **Cookies / sessions across origins:** If the UI loads from a different origin than the API (typical Tauri: `http://localhost:…` while the API is `http://&lt;LAN-IP&gt;:…`), browsers do not send `SameSite=Lax` session cookies on cross-origin `fetch`. After login, the app stores the server `sessionToken` and sends `Authorization: Bearer …` on API calls; the server accepts cookie **or** Bearer (or `X-Session-Token`). CORS on `/api/*` allows these headers.

## Client mode banner

If the app is set to **Client** but no server URL is saved, a top banner links to **Admin → Network** until configured.
