import { AsyncLocalStorage } from 'node:async_hooks';
import nodeConsole from 'node:console';
import { skipCSRFCheck } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import { authHandler, initAuthConfig } from '@hono/auth-js';
import { hash, verify } from 'argon2';
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { proxy } from 'hono/proxy';
import { requestId } from 'hono/request-id';
import { createHonoServer } from 'react-router-hono-server/node';
import { serializeError } from 'serialize-error';
import net from 'node:net';
import { getHTMLForErrorPage } from './get-html-for-error-page';
import { isAuthAction } from './is-auth-action';
import { API_BASENAME, api } from './route-builder';
import { startLanUdpBeacon, stopLanUdpBeacon } from './lan-udp-beacon';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const als = new AsyncLocalStorage<{ requestId: string }>();
let selectedServerPort: number | undefined;

const HTTP_PORT_STATE_FILE = 'http_port.json';
const PORT_REASSIGN_NOTICE_FILE = 'port_reassign_notice.json';

/** Set when a persisted port was busy and we bound another port (consumed in listeningListener). */
let pendingPortReassign: { previousPort: number; newPort: number } | null = null;

function readPersistedHttpPort(dataDir: string): number | undefined {
  try {
    const fp = path.join(dataDir, HTTP_PORT_STATE_FILE);
    if (!existsSync(fp)) return undefined;
    const j = JSON.parse(readFileSync(fp, 'utf8')) as { port?: unknown };
    const n = Number(j?.port);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Best-effort: same bind shape as the embedded HTTP server (all interfaces). */
function canBindPortOnAllInterfaces(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try {
        s.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    const t = setTimeout(() => done(false), 4000);
    s.once('error', () => done(false));
    s.listen(port, '0.0.0.0', () => {
      s.close(() => done(true));
    });
  });
}

async function findAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('failed to resolve dynamic port')));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = nodeConsole[method].bind(console);

  console[method] = (...args: unknown[]) => {
    const requestId = als.getStore()?.requestId;
    if (requestId) {
      original(`[traceId:${requestId}]`, ...args);
    } else {
      original(...args);
    }
  };
}

// Using local SQLite database instead of Neon
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
// });
// const adapter = NeonAdapter(pool);

// Production (embedded): load config from DREAMNET_DATA_DIR/config.json
// and ensure AUTH_SECRET exists (generated once).
// DREAMNET_INSTALLER_MODE (client|server) is injected by Tauri (server_launch.rs) from installer_mode.txt
// when the Windows NSIS installer created it — keep in sync with installer-hooks.nsh.
try {
  const dataDir = process.env.DREAMNET_DATA_DIR;
  if (dataDir) {
    const configPath = path.join(dataDir, 'config.json');
    let config = {};
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    }
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === 'string' && v.length > 0 && !process.env[k]) {
        process.env[k] = v;
      }
    }
    // BOOTSTRAP_PUBLIC_KEY_PEM is enforced by the Tauri launcher in production builds.
    if (!process.env.AUTH_SECRET) {
      const authSecret = crypto.randomBytes(32).toString('base64url');
      process.env.AUTH_SECRET = authSecret;
      (config as any).AUTH_SECRET = authSecret;
      mkdir(dataDir, { recursive: true })
        .then(() => writeFile(configPath, JSON.stringify(config, null, 2), 'utf8'))
        .catch(() => {});
    }
    // Used by Auth.js `getToken` helpers to decide cookie security.
    if (!process.env.AUTH_URL) {
      process.env.AUTH_URL = 'http://localhost';
    }
  }
} catch {
  // ignore malformed config; app can still run without Auth.js helpers.
}

// Production bundle: make relative paths stable regardless of how Node is launched.
// The compiled entrypoint lives at: <pos-app>/build/server/index.js
// We want process.cwd() to be <pos-app> so things like "build/client" resolve correctly.
try {
  const entryFile = fileURLToPath(import.meta.url);
  const entryDir = path.dirname(entryFile);
  if (entryDir.includes(`${path.sep}build${path.sep}server`)) {
    const posAppRoot = path.resolve(entryDir, '..', '..');
    try {
      const expectedClientDir = path.join(posAppRoot, 'build', 'client');
      if (existsSync(expectedClientDir)) {
        process.chdir(posAppRoot);
      }
    } catch {
      // ignore
    }
    const requestedRaw = Number(process.env.PORT);
    const requested =
      Number.isInteger(requestedRaw) && requestedRaw > 0 && requestedRaw < 65536 ? requestedRaw : NaN;
    const dataDirEmbedded = process.env.DREAMNET_DATA_DIR?.trim();

    if (Number.isInteger(requested)) {
      // Explicit PORT (e.g. config.json) wins over persisted file.
      selectedServerPort = requested;
      process.env.PORT = String(selectedServerPort);
    } else if (dataDirEmbedded) {
      const saved = readPersistedHttpPort(dataDirEmbedded);
      if (saved != null && (await canBindPortOnAllInterfaces(saved))) {
        selectedServerPort = saved;
        process.env.PORT = String(saved);
      } else {
        const picked = await findAvailablePort();
        selectedServerPort = picked;
        process.env.PORT = String(picked);
        if (saved != null && saved !== picked) {
          pendingPortReassign = { previousPort: saved, newPort: picked };
        }
      }
    } else {
      // Bundled layout but no data dir (should not happen in production): pick any free port.
      selectedServerPort = await findAvailablePort();
      process.env.PORT = String(selectedServerPort);
    }
    const clientIndexPath = path.join(posAppRoot, 'build', 'client', 'index.html');
    if (existsSync(clientIndexPath)) {
      try {
        const full = readFileSync(clientIndexPath, 'utf8');
        // react-router-hono-server serveStatic serves this file for GET / — must not be Tauri splash.
        const isTauriFallback =
          full.includes('Starting application server') ||
          full.includes('Starting application server…') ||
          full.includes('Starting application server...');
        if (isTauriFallback) {
          unlinkSync(clientIndexPath);
        }
      } catch {
        /* ignore */
      }
    }
  }
} catch {
  // ignore
}

const app = new Hono();

app.use('*', requestId());

app.use('*', (c, next) => {
  const requestId = c.get('requestId');
  return als.run({ requestId }, () => next());
});

app.use(contextStorage());

app.onError((err, c) => {
  if (c.req.method !== 'GET') {
    return c.json(
      {
        error: 'An error occurred in your app',
        details: serializeError(err),
      },
      500
    );
  }
  return c.html(getHTMLForErrorPage(err), 200);
});

if (process.env.CORS_ORIGINS) {
  app.use(
    '/*',
    cors({
      origin: process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    })
  );
}

// Auth configuration disabled for local development
// if (process.env.AUTH_SECRET) {
//   app.use(
//     '*',
//     initAuthConfig((c) => ({
//       secret: c.env.AUTH_SECRET,
//       pages: {
//         signIn: '/account/signin',
//         signOut: '/account/logout',
//       },
//       skipCSRFCheck,
//       session: {
//         strategy: 'jwt',
//       },
//       callbacks: {
//         session({ session, token }) {
//           if (token.sub) {
//             session.user.id = token.sub;
//           }
//           return session;
//         },
//       },
//       cookies: {
//         csrfToken: {
//           options: {
//             secure: true,
//             sameSite: 'none',
//           },
//         },
//         sessionToken: {
//           options: {
//             secure: true,
//             sameSite: 'none',
//           },
//         },
//         callbackUrl: {
//           options: {
//             secure: true,
//             sameSite: 'none',
//           },
//         },
//       },
//       providers: [
//         Credentials({
//           id: 'credentials-signin',
//           name: 'Credentials Sign in',
//           credentials: {
//             email: {
//               label: 'Email',
//               type: 'email',
//             },
//             password: {
//               label: 'Password',
//               type: 'password',
//             },
//           },
//           authorize: async (credentials) => {
//             const { email, password } = credentials;
//             if (!email || !password) {
//               return null;
//             }
//             if (typeof email !== 'string' || typeof password !== 'string') {
//               return null;
//             }

//             // logic to verify if user exists
//             const user = await adapter.getUserByEmail(email);
//             if (!user) {
//               return null;
//             }
//             const matchingAccount = user.accounts.find(
//               (account) => account.provider === 'credentials'
//             );
//             const accountPassword = matchingAccount?.password;
//             if (!accountPassword) {
//               return null;
//             }

//             const isValid = await verify(accountPassword, password);
//             if (!isValid) {
//               return null;
//             }

//             // return user object with the their profile data
//             return user;
//           },
//         }),
//         Credentials({
//           id: 'credentials-signup',
//           name: 'Credentials Sign up',
//           credentials: {
//             email: {
//               label: 'Email',
//               type: 'email',
//             },
//             password: {
//               label: 'Password',
//               type: 'password',
//             },
//           },
//           authorize: async (credentials) => {
//             const { email, password } = credentials;
//             if (!email || !password) {
//               return null;
//             }
//             if (typeof email !== 'string' || typeof password !== 'string') {
//               return null;
//             }

//             // logic to verify if user exists
//             const user = await adapter.getUserByEmail(email);
//             if (!user) {
//               const newUser = await adapter.createUser({
//                 id: crypto.randomUUID(),
//                 emailVerified: null,
//                 email,
//               });
//               await adapter.linkAccount({
//                 extraData: {
//                   password: await hash(password),
//                 },
//                 type: 'credentials',
//                 userId: newUser.id,
//                 providerAccountId: newUser.id,
//                 provider: 'credentials',
//               });
//               return newUser;
//             }
//             return null;
//           },
//         }),
//       ],
//     }))
//   );
// }
app.all('/integrations/:path{.+}', async (c, next) => {
  const queryParams = c.req.query();
  const url = `${process.env.NEXT_PUBLIC_CREATE_BASE_URL ?? 'https://www.create.xyz'}/integrations/${c.req.param('path')}${Object.keys(queryParams).length > 0 ? `?${new URLSearchParams(queryParams).toString()}` : ''}`;

  return proxy(url, {
    method: c.req.method,
    body: c.req.raw.body ?? null,
    // @ts-ignore - this key is accepted even if types not aware and is
    // required for streaming integrations
    duplex: 'half',
    redirect: 'manual',
    headers: {
      ...c.req.header(),
      'X-Forwarded-For': process.env.NEXT_PUBLIC_CREATE_HOST,
      'x-createxyz-host': process.env.NEXT_PUBLIC_CREATE_HOST,
      Host: process.env.NEXT_PUBLIC_CREATE_HOST,
      'x-createxyz-project-group-id': process.env.NEXT_PUBLIC_PROJECT_GROUP_ID,
    },
  });
});

// Auth.js middleware - disabled since we're using custom auth
// app.use('/api/auth/*', async (c, next) => {
//   if (isAuthAction(c.req.path)) {
//     return authHandler()(c, next);
//   }
//   return next();
// });

// LAN / multi-workstation: other workstations call this host's /api (cookies + JSON)
app.use(
  `${API_BASENAME}/*`,
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Token',
      'Cookie',
      'X-Requested-With',
      'Accept',
      'Cache-Control',
      'X-Workstation-Id',
      'X-Workstation-Name',
      'X-Deployment-Mode',
      'X-Client-Origin',
    ],
    credentials: true,
    maxAge: 86400,
  })
);

app.route(API_BASENAME, api);

const honoApp = await createHonoServer({
  app,
  defaultLogger: false,
  ...(selectedServerPort ? { port: selectedServerPort } : {}),
  listeningListener: (info: { port: number }) => {
    console.log(`🚀 Server started on port ${info.port}`);
    console.log(`🌎 http://127.0.0.1:${info.port}`);
    (globalThis as { __POS_HTTP_PORT__?: number }).__POS_HTTP_PORT__ = info.port;
    startLanUdpBeacon(info.port);
    const dataDir = process.env.DREAMNET_DATA_DIR;
    if (dataDir) {
      const runtimePath = path.join(dataDir, 'runtime.json');
      const httpStatePath = path.join(dataDir, HTTP_PORT_STATE_FILE);
      const body = JSON.stringify({ port: info.port }, null, 2);
      mkdir(dataDir, { recursive: true })
        .then(async () => {
          await writeFile(runtimePath, body, 'utf8');
          await writeFile(httpStatePath, body, 'utf8');
          if (pendingPortReassign && pendingPortReassign.newPort === info.port) {
            const noticePath = path.join(dataDir, PORT_REASSIGN_NOTICE_FILE);
            await writeFile(
              noticePath,
              JSON.stringify(
                {
                  previousPort: pendingPortReassign.previousPort,
                  newPort: pendingPortReassign.newPort,
                  at: new Date().toISOString(),
                },
                null,
                2
              ),
              'utf8'
            );
            pendingPortReassign = null;
          }
        })
        .catch(() => {});
    }
  },
});

// Dev: Vite owns the HTTP server — listeningListener may not run; still start UDP beacon on app port.
const isViteDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
if (isViteDev) {
  const devPort = Number(process.env.PORT) || 4000;
  (globalThis as { __POS_HTTP_PORT__?: number }).__POS_HTTP_PORT__ = devPort;
  startLanUdpBeacon(devPort);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopLanUdpBeacon();
  });
}
process.once('beforeExit', () => stopLanUdpBeacon());
process.once('exit', () => stopLanUdpBeacon());

export default honoApp;
