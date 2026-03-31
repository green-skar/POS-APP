import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useAsyncError,
  useLocation,
  useRouteError,
} from 'react-router';

import { useButton } from '@react-aria/button';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FC,
  Component,
} from 'react';
import './global.css';

// Load saved theme on app initialization - moved to useEffect to prevent hydration warnings

import fetch from '@/__create/fetch';
import { useNavigate } from 'react-router';
import { serializeError } from 'serialize-error';
import { Toaster, toast } from 'sonner';
// @ts-ignore
import { LoadFonts } from 'virtual:load-fonts.jsx';
import { HotReloadIndicator } from '../__create/HotReload';
import { useSandboxStore } from '../__create/hmr-sandbox-store';
import type { Route } from './+types/root';
import { useDevServerHeartbeat } from '../__create/useDevServerHeartbeat';
import {
  logoutOnAppExitAsync,
} from '../utils/logoutOnAppExit.js';
import { applyThemeToDocument } from '../utils/applyThemeDom.js';
import {
  apiFetch,
  getApiBaseUrl,
  getDiscoveryHttpPort,
  getDeploymentMode,
  getWorkstationId,
  setApiBaseUrl,
  setDeploymentMode,
  DEPLOYMENT_SERVER,
  DEPLOYMENT_CLIENT,
  hasDeploymentModeSelection,
  getWorkstationName,
} from '../utils/apiClient.js';
import { discoverPosServers } from '../utils/lanDiscovery.js';
import {
  fetchServerThemeJson,
  rewriteThemeAssetsForClient,
} from '../utils/themeSync.js';
import ThemeLoadingOverlay from '../components/ThemeLoadingOverlay';
import AppFooter from '../components/AppFooter.jsx';
import { AuthProvider } from '../utils/useAuth.js';
import {
  isTauriDesktop,
  getNgrokAutoConfig,
  startNgrokTunnel,
  setLastNgrokPublicUrl,
  stopNgrokTunnel,
} from '../utils/ngrokBridge.js';

const THEME_OVERLAY_MIN_MS = 560;

function normalizeBootClientServerUrl(raw: string): string | null {
  const t = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) {
    return `http://${t}`.replace(/\/+$/, '');
  }
  return t;
}

async function persistBootDeploymentMode(mode: 'server' | 'client'): Promise<void> {
  try {
    await fetch('/api/bootstrap/deployment-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode }),
    });
  } catch {
    /* ignore */
  }
}

function pickBootStepFromBootstrapApi(data: {
  activated?: boolean;
  hasSuperAdmin?: boolean;
}): 'activation' | 'superadmin' | 'mode' {
  if (!data?.activated) return 'activation';
  if (!data?.hasSuperAdmin) return 'superadmin';
  return 'mode';
}

export const links = () => {
  return [
    { rel: "icon", href: "/src/__create/favicon.png" },
  ];
};

if (globalThis.window && globalThis.window !== undefined) {
  globalThis.window.fetch = fetch;
}

function SharedErrorBoundary({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children?: ReactNode;
}): React.ReactElement {
  return (
    <div
      className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-500 ease-out ${
        isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div className="bg-[#18191B] text-[#F2F2F2] rounded-lg p-4 max-w-md w-full mx-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-[#F2F2F2] rounded-full flex items-center justify-center">
              <span className="text-black text-[1.125rem] leading-none">⚠</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <div className="flex flex-col gap-1">
              <p className="font-light text-[#F2F2F2] text-sm">App Error Detected</p>
              <p className="text-[#959697] text-sm font-light">
                It looks like an error occurred while trying to use your app.
              </p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * NOTE: we have a shared error boundary for the app, but then we also expose
 * this in case something goes wrong outside of the normal user's app flow.
 * React-router will mount this one
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <SharedErrorBoundary isOpen={true} />;
}

function InternalErrorBoundary({ error: errorArg }: Route.ErrorBoundaryProps) {
  const routeError = useRouteError();
  const asyncError = useAsyncError();
  const error = errorArg ?? asyncError ?? routeError;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const animateTimer = setTimeout(() => setIsOpen(true), 100);
    return () => clearTimeout(animateTimer);
  }, []);
  const { buttonProps: showLogsButtonProps } = useButton(
    {
      onPress: useCallback(() => {
        window.parent.postMessage(
          {
            type: 'sandbox:web:show-logs',
          },
          '*'
        );
      }, []),
    },
    useRef<HTMLButtonElement>(null)
  );
  const { buttonProps: fixButtonProps } = useButton(
    {
      onPress: useCallback(() => {
        window.parent.postMessage(
          {
            type: 'sandbox:web:fix',
            error: serializeError(error),
          },
          '*'
        );
        setIsOpen(false);
      }, [error]),
      isDisabled: !error,
    },
    useRef<HTMLButtonElement>(null)
  );
  const { buttonProps: copyButtonProps } = useButton(
    {
      onPress: useCallback(() => {
        navigator.clipboard.writeText(JSON.stringify(serializeError(error)));
      }, [error]),
    },
    useRef<HTMLButtonElement>(null)
  );

  function isInIframe() {
    try {
      return window.parent !== window;
    } catch {
      return true;
    }
  }
  return (
    <SharedErrorBoundary isOpen={isOpen}>
      {isInIframe() ? (
        <div className="flex gap-2">
          {!!error && (
            <button
              className="flex flex-row items-center justify-center gap-[4px] outline-none transition-colors rounded-[8px] border-[1px] bg-[#f9f9f9] hover:bg-[#dbdbdb] active:bg-[#c4c4c4] border-[#c4c4c4] text-[#18191B] text-sm px-[8px] py-[4px] cursor-pointer"
              type="button"
              {...fixButtonProps}
            >
              Try to fix
            </button>
          )}

          <button
            className="flex flex-row items-center justify-center gap-[4px] outline-none transition-colors rounded-[8px] border-[1px] bg-[#2C2D2F] hover:bg-[#414243] active:bg-[#555658] border-[#414243] text-white text-sm px-[8px] py-[4px]"
            type="button"
            {...showLogsButtonProps}
          >
            Show logs
          </button>
        </div>
      ) : (
        <button
          className="flex flex-row items-center justify-center gap-[4px] outline-none transition-colors rounded-[8px] border-[1px] bg-[#2C2D2F] hover:bg-[#414243] active:bg-[#555658] border-[#414243] text-white text-sm px-[8px] py-[4px] w-fit"
          type="button"
          {...copyButtonProps}
        >
          Copy error
        </button>
      )}
    </SharedErrorBoundary>
  );
}

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = { hasError: boolean; error: unknown | null };

class ErrorBoundaryWrapper extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return <InternalErrorBoundary error={this.state.error} params={{}} />;
    }
    return this.props.children;
  }
}

function LoaderWrapper({ loader }: { loader: () => React.ReactNode }) {
  return <>{loader()}</>;
}

type ClientOnlyProps = {
  loader: () => React.ReactNode;
};

export const ClientOnly: React.FC<ClientOnlyProps> = ({ loader }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <ErrorBoundaryWrapper>
      <LoaderWrapper loader={loader} />
    </ErrorBoundaryWrapper>
  );
};

/**
 * useHmrConnection()
 * ------------------
 * • `true`  → HMR socket is healthy
 * • `false` → socket lost (Vite is polling / may auto‑reload soon)
 *
 * Works only in dev; in prod it always returns `true`.
 */
export function useHmrConnection(): boolean {
  const [connected, setConnected] = useState(() => !!import.meta.hot);

  useEffect(() => {
    // No HMR object outside dev builds
    if (!import.meta.hot) return;

    /** Fired the moment the WS closes unexpectedly */
    const onDisconnect = () => setConnected(false);
    /** Fired every time the WS (re‑)opens */
    const onConnect = () => setConnected(true);

    import.meta.hot.on('vite:ws:disconnect', onDisconnect);
    import.meta.hot.on('vite:ws:connect', onConnect);

    // Optional: catch the “about to full‑reload” event as a last resort
    const onFullReload = () => setConnected(false);
    import.meta.hot.on('vite:beforeFullReload', onFullReload);

    return () => {
      import.meta.hot?.off('vite:ws:disconnect', onDisconnect);
      import.meta.hot?.off('vite:ws:connect', onConnect);
      import.meta.hot?.off('vite:beforeFullReload', onFullReload);
    };
  }, []);

  return connected;
}

const healthyResponseType = 'sandbox:web:healthcheck:response';
const useHandshakeParent = () => {
  const isHmrConnected = useHmrConnection();
  useEffect(() => {
    const healthyResponse = {
      type: healthyResponseType,
      healthy: isHmrConnected,
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'sandbox:web:healthcheck') {
        window.parent.postMessage(healthyResponse, '*');
      }
    };
    window.addEventListener('message', handleMessage);
    // Immediately respond to the parent window with a healthy response in
    // case we missed the healthcheck message
    window.parent.postMessage(healthyResponse, '*');
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isHmrConnected]);
};

const useCodeGen = () => {
  const { startCodeGen, setCodeGenGenerating, completeCodeGen, errorCodeGen, stopCodeGen } =
    useSandboxStore();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type } = event.data;

      switch (type) {
        case 'sandbox:web:codegen:started':
          startCodeGen();
          break;
        case 'sandbox:web:codegen:generating':
          setCodeGenGenerating();
          break;
        case 'sandbox:web:codegen:complete':
          completeCodeGen();
          break;
        case 'sandbox:web:codegen:error':
          errorCodeGen();
          break;
        case 'sandbox:web:codegen:stopped':
          stopCodeGen();
          break;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [startCodeGen, setCodeGenGenerating, completeCodeGen, errorCodeGen, stopCodeGen]);
};

const useRefresh = () => {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'sandbox:web:refresh:request') {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        window.parent.postMessage({ type: 'sandbox:web:refresh:complete' }, '*');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
};

export function Layout({ children }: { children: ReactNode }) {
  useHandshakeParent();
  useCodeGen();
  useRefresh();
  useDevServerHeartbeat();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location?.pathname;

  /** False until first theme resolve (server + fallback); drives infinity overlay. */
  const [themeBootstrapped, setThemeBootstrapped] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [bootModeReady, setBootModeReady] = useState(false);
  const [showBootModePicker, setShowBootModePicker] = useState(false);
  const [bootServerPassword, setBootServerPassword] = useState('');
  const [bootServerBusy, setBootServerBusy] = useState(false);
  const [bootPickerError, setBootPickerError] = useState('');
  const [bootClientDiscovering, setBootClientDiscovering] = useState(false);
  const [bootClientServers, setBootClientServers] = useState<any[]>([]);
  const [bootClientSelected, setBootClientSelected] = useState('');
  const [bootClientManualUrl, setBootClientManualUrl] = useState('');
  const [bootClientManualBusy, setBootClientManualBusy] = useState(false);
  const [bootClientError, setBootClientError] = useState('');
  const [bootStep, setBootStep] = useState<'activation' | 'superadmin' | 'mode'>('activation');
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [bootstrapRequestCode, setBootstrapRequestCode] = useState('');
  const [bootstrapResponseToken, setBootstrapResponseToken] = useState('');
  const [bootstrapError, setBootstrapError] = useState('');
  const [superAdminUsername, setSuperAdminUsername] = useState('superadmin');
  const [superAdminFullName, setSuperAdminFullName] = useState('Super Admin');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminPasswordConfirm, setSuperAdminPasswordConfirm] = useState('');
  const [superAdminError, setSuperAdminError] = useState('');
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (typeof window === 'undefined') return;
      if (hasDeploymentModeSelection()) {
        if (!mounted) return;
        setShowBootModePicker(false);
        setBootModeReady(true);
        return;
      }
      setShowBootModePicker(true);
      setBootModeReady(false);
      try {
        const persistedModeRes = await fetch('/api/bootstrap/deployment-mode', { credentials: 'include' });
        const persistedModeData = await persistedModeRes.json().catch(() => ({}));
        const persistedMode = String(persistedModeData?.mode || '').trim();
        if (persistedMode === DEPLOYMENT_SERVER || persistedMode === DEPLOYMENT_CLIENT) {
          setDeploymentMode(persistedMode);
          if (!mounted) return;
          setShowBootModePicker(false);
          setBootModeReady(true);
          return;
        }
        const r = await apiFetch('/api/bootstrap/status', { credentials: 'include' });
        const data = await r.json().catch(() => ({}));
        if (!mounted) return;
        setBootStep(pickBootStepFromBootstrapApi(data));
      } catch {
        if (!mounted) return;
        setBootStep('activation');
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!bootModeReady) return;
    if (typeof window === 'undefined') return;
    if (getDeploymentMode() !== DEPLOYMENT_SERVER) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/bootstrap/port-reassign-notice', { credentials: 'include' });
        const data = await r.json().catch(() => ({}));
        if (cancelled || !data?.notice?.newPort) return;
        const prev = data.notice.previousPort;
        const next = data.notice.newPort;
        toast.warning('Server HTTP port changed', {
          description:
            typeof prev === 'number'
              ? `Port ${prev} was already in use. This app is now on port ${next}. Update saved client URLs or bookmarks on other PCs if needed.`
              : `The embedded server is now on port ${next}.`,
          duration: 14000,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootModeReady]);

  const generateBootstrapRequestCode = useCallback(async () => {
    setBootstrapError('');
    setBootstrapBusy(true);
    try {
      const r = await apiFetch('/api/bootstrap/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: getWorkstationId(),
          installer_version: '0.1.0',
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.requestCode) {
        throw new Error(String(data?.error || 'Failed to generate request code'));
      }
      setBootstrapRequestCode(String(data.requestCode));
    } catch (e: any) {
      setBootstrapError(String(e?.message || 'Failed to generate request code'));
    } finally {
      setBootstrapBusy(false);
    }
  }, []);

  const activateBootstrapCode = useCallback(async () => {
    setBootstrapError('');
    if (!bootstrapRequestCode.trim() || !bootstrapResponseToken.trim()) {
      setBootstrapError('Generate request code and paste response token to continue.');
      return;
    }
    setBootstrapBusy(true);
    try {
      const r = await apiFetch('/api/bootstrap/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestCode: bootstrapRequestCode.trim(),
          responseToken: bootstrapResponseToken.trim(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) {
        throw new Error(String(data?.error || 'Bootstrap activation failed'));
      }
      const sr = await apiFetch('/api/bootstrap/status', { credentials: 'include' });
      const statusData = await sr.json().catch(() => ({}));
      setBootStep(pickBootStepFromBootstrapApi(statusData));
    } catch (e: any) {
      setBootstrapError(String(e?.message || 'Bootstrap activation failed'));
    } finally {
      setBootstrapBusy(false);
    }
  }, [bootstrapRequestCode, bootstrapResponseToken]);

  const createBootstrapSuperAdmin = useCallback(async () => {
    setSuperAdminError('');
    if (!superAdminUsername.trim() || !superAdminPassword.trim()) {
      setSuperAdminError('Username and password are required.');
      return;
    }
    if (superAdminPassword.length < 8) {
      setSuperAdminError('Password must be at least 8 characters.');
      return;
    }
    if (superAdminPassword !== superAdminPasswordConfirm) {
      setSuperAdminError('Passwords do not match.');
      return;
    }
    setBootstrapBusy(true);
    try {
      const r = await apiFetch('/api/bootstrap/create-superadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: superAdminUsername.trim(),
          fullName: superAdminFullName.trim() || 'Super Admin',
          password: superAdminPassword,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to create super admin'));
      }
      setSuperAdminPassword('');
      setSuperAdminPasswordConfirm('');
      setBootStep('mode');
    } catch (e: any) {
      setSuperAdminError(String(e?.message || 'Failed to create super admin'));
    } finally {
      setBootstrapBusy(false);
    }
  }, [superAdminUsername, superAdminFullName, superAdminPassword, superAdminPasswordConfirm]);

  const recheckBootstrapStatus = useCallback(async () => {
    setSuperAdminError('');
    setBootstrapError('');
    setBootstrapBusy(true);
    try {
      const r = await apiFetch('/api/bootstrap/status', { credentials: 'include' });
      const data = await r.json().catch(() => ({}));
      setBootStep(pickBootStepFromBootstrapApi(data));
    } catch (e: any) {
      setSuperAdminError(String(e?.message || 'Could not read setup status'));
    } finally {
      setBootstrapBusy(false);
    }
  }, []);

  const chooseClientModeAtBoot = useCallback(async () => {
    setBootPickerError('');
    setBootClientError('');
    setBootClientDiscovering(true);
    setBootClientServers([]);
    setBootClientSelected('');
    try {
      await stopNgrokTunnel();
    } catch {
      /* ignore */
    }
    try {
      const servers = await discoverPosServers({
        httpPort: getDiscoveryHttpPort(),
      });
      setBootClientServers(Array.isArray(servers) ? servers : []);
      if (servers?.length) {
        const firstOrigin = String(servers[0]?.info?.suggestedLanUrl || servers[0]?.origin || '').trim();
        setBootClientSelected(firstOrigin);
      } else {
        setBootClientError(
          'No server found on LAN. Start the server PC, try Scan again, or enter the server URL manually below (include port, e.g. http://192.168.1.5:4000).'
        );
      }
    } catch {
      setBootClientError('Could not scan LAN servers. Check network/firewall, or enter the server URL manually below.');
    } finally {
      setBootClientDiscovering(false);
    }
  }, []);

  const verifyManualClientUrlAtBoot = useCallback(async () => {
    setBootClientError('');
    const base = normalizeBootClientServerUrl(bootClientManualUrl);
    if (!base) {
      setBootClientError('Enter the server URL, including port (example: http://192.168.1.10:4000).');
      return;
    }
    setBootClientManualBusy(true);
    try {
      const r = await fetch(`${base}/api/health`, { method: 'GET', credentials: 'omit' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok || j?.service !== 'pos-api') {
        setBootClientError('That address did not return POS API health. Check IP, port, and firewall.');
        return;
      }
      setBootClientSelected(base);
      setBootPickerError('');
    } catch {
      setBootClientError('Could not reach that URL. Check the network and try again.');
    } finally {
      setBootClientManualBusy(false);
    }
  }, [bootClientManualUrl]);

  const confirmClientModeAtBoot = useCallback(() => {
    const picked = String(bootClientSelected || '').trim();
    if (!picked) {
      setBootClientError('Select a server to continue as client.');
      return;
    }
    setDeploymentMode(DEPLOYMENT_CLIENT);
    setApiBaseUrl(picked);
    void persistBootDeploymentMode(DEPLOYMENT_CLIENT);
    setShowBootModePicker(false);
    setBootModeReady(true);
  }, [bootClientSelected]);

  const chooseServerModeAtBoot = useCallback(async () => {
    if (!bootServerPassword.trim()) {
      setBootPickerError('Super admin password is required to start in Server mode.');
      return;
    }
    setBootPickerError('');
    setBootServerBusy(true);
    try {
      const res = await fetch('/api/auth/verify-super-admin-boot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: bootServerPassword }),
      });
      if (!res.ok) {
        throw new Error('Invalid super admin password');
      }
      setDeploymentMode(DEPLOYMENT_SERVER);
      void persistBootDeploymentMode(DEPLOYMENT_SERVER);
      setShowBootModePicker(false);
      setBootModeReady(true);
      setBootServerPassword('');
      setBootPickerError('');
    } catch {
      setBootPickerError('Invalid super admin password. Please try again.');
    } finally {
      setBootServerBusy(false);
    }
  }, [bootServerPassword]);


  const applyThemeFromStorage = useCallback(() => {
    try {
      const tempTheme = sessionStorage.getItem('temp-theme');
      const savedTheme = localStorage.getItem('app-theme');
      const themeToLoad = tempTheme || savedTheme;
      if (themeToLoad) {
        applyThemeToDocument(JSON.parse(themeToLoad));
      }
    } catch (e) {
      console.error('Error loading theme:', e);
    }
  }, []);

  /**
   * All installs: try GET /api/theme first (same-origin LAN browsers + remote client URLs).
   * Preview (temp-theme) skips server fetch. Falls back to localStorage if API has no theme.
   */
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof window === 'undefined') return;

      const temp = sessionStorage.getItem('temp-theme');
      if (temp) {
        try {
          applyThemeToDocument(JSON.parse(temp));
        } catch {
          applyThemeFromStorage();
        }
        if (!cancelled) setThemeBootstrapped(true);
        return;
      }

      const t0 = Date.now();
      try {
        const data = await fetchServerThemeJson();
        if (cancelled) return;
        if (data?.theme) {
          const base = getApiBaseUrl();
          const rewritten = rewriteThemeAssetsForClient(data.theme, base);
          localStorage.setItem('app-theme', JSON.stringify(rewritten));
          applyThemeToDocument(rewritten);
          window.dispatchEvent(new Event('theme-changed'));
        } else {
          applyThemeFromStorage();
        }
      } catch {
        if (!cancelled) applyThemeFromStorage();
      }
      const elapsed = Date.now() - t0;
      if (!cancelled) {
        if (elapsed < THEME_OVERLAY_MIN_MS) {
          await new Promise((r) => setTimeout(r, THEME_OVERLAY_MIN_MS - elapsed));
        }
        setThemeBootstrapped(true);
      }
    };

    void run();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      void (async () => {
        if (sessionStorage.getItem('temp-theme')) return;
        try {
          const data = await fetchServerThemeJson();
          if (cancelled || !data?.theme) return;
          const base = getApiBaseUrl();
          const rewritten = rewriteThemeAssetsForClient(data.theme, base);
          localStorage.setItem('app-theme', JSON.stringify(rewritten));
          applyThemeToDocument(rewritten);
          window.dispatchEvent(new Event('theme-changed'));
        } catch {
          /* ignore */
        }
      })();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [applyThemeFromStorage]);

  // Desktop quality-of-life: optionally auto-start ngrok at launch.
  useEffect(() => {
    if (!isTauriDesktop()) return;
    if (!hasDeploymentModeSelection()) return;
    if (getDeploymentMode() !== DEPLOYMENT_SERVER) return;
    const cfg = getNgrokAutoConfig();
    if (!cfg.autoStartTunnel) return;
    let cancelled = false;

    void (async () => {
      try {
        const s = await startNgrokTunnel(cfg.tunnelPort);
        const url = s?.public_url || s?.publicUrl;
        if (!cancelled && url) {
          setLastNgrokPublicUrl(url);
        }
      } catch {
        // Manual controls in Payment Settings are the fallback path.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for theme changes in localStorage and sessionStorage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'app-theme' || e.key === 'temp-theme') {
        applyThemeFromStorage();
      }
    };

    // Listen for storage events (works across tabs)
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom event (for same-tab updates)
    const handleThemeChange = () => {
      applyThemeFromStorage();
    };
    window.addEventListener('theme-changed', handleThemeChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('theme-changed', handleThemeChange);
    };
  }, [applyThemeFromStorage]);

  // Network workstation heartbeat + suspension status polling.
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      try {
        await apiFetch('/api/network/heartbeat', { method: 'POST', credentials: 'include' });
      } catch {
        /* ignore */
      }
      try {
        const r = await apiFetch('/api/network/self-status', { credentials: 'include' });
        const data = await r.json().catch(() => ({}));
        if (!mounted) return;
        if (data?.suspended) {
          setSuspensionReason(String(data.reason || 'This workstation has been suspended by an administrator.'));
        } else {
          setSuspensionReason('');
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    timer = setInterval(tick, 15000);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);
  
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'sandbox:navigation') {
        navigate(event.data.pathname);
      }
    };
    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ type: 'sandbox:web:ready' }, '*');
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [navigate]);

  useEffect(() => {
    if (pathname) {
      window.parent.postMessage(
        {
          type: 'sandbox:web:navigation',
          pathname,
        },
        '*'
      );
    }
  }, [pathname]);

  // Note: Session verification is now handled by useAuth hook
  // No need to duplicate session checking here

  // Log out when the window closes (Tauri desktop app or browser tab).
  useEffect(() => {
    let tauriCloseUnlisten: (() => void) | undefined;

    // Tauri: WebView2 persists cookies + sessionStorage across launches. We must await logout
    // before the process exits — so preventDefault(), then close() after (see Tauri 2 docs).
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        tauriCloseUnlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            try {
              await stopNgrokTunnel();
            } catch {
              /* ignore */
            }
            // Always hit logout (clears HttpOnly cookie via Set-Cookie); idempotent if already logged out.
            await logoutOnAppExitAsync();
          } finally {
            tauriCloseUnlisten?.();
            try {
              await win.close();
            } catch {
              // ignore
            }
          }
        });
      } catch {
        // Not running inside Tauri or API unavailable — rely on beforeunload/pagehide below.
      }
    })();

    return () => {
      tauriCloseUnlisten?.();
    };
  }, []);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script type="module" src="/src/__create/dev-error-overlay.js"></script>
        <link rel="icon" href="/src/__create/favicon.png" />
        <LoadFonts />
      </head>
      <body>
        {suspensionReason ? (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100000] rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm shadow-lg">
            <strong>Workstation suspended:</strong> {suspensionReason}
          </div>
        ) : null}
        {showBootModePicker ? (
          <div
            className="fixed inset-0 z-[100001] bg-black/70 flex items-center justify-center px-4"
            style={{ backgroundImage: "url('/Texturelabs_Wood_280L.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
          >
            <div className="w-full max-w-lg rounded-2xl border border-amber-900/20 bg-white/90 backdrop-blur-sm p-6 shadow-2xl space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Setup</h2>
              <p className="text-sm text-gray-700">Complete the steps below to finish setting up this installation.</p>

              {bootStep === 'activation' ? (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-white/80 p-3">
                  <p className="text-sm text-gray-700">Step 1: Activate this installation.</p>
                  <button
                    type="button"
                    onClick={() => void generateBootstrapRequestCode()}
                    disabled={bootstrapBusy}
                    className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
                  >
                    {bootstrapBusy ? 'Generating...' : 'Get activation request'}
                  </button>
                  <textarea
                    readOnly
                    value={bootstrapRequestCode}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-mono"
                    placeholder="Your request will appear here — send it to your contact, then paste the reply below"
                  />
                  <textarea
                    value={bootstrapResponseToken}
                    onChange={(e) => setBootstrapResponseToken(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono"
                    placeholder="Paste the activation code you received"
                  />
                  {bootstrapError ? <p className="text-xs text-red-600">{bootstrapError}</p> : null}
                  <button
                    type="button"
                    onClick={() => void activateBootstrapCode()}
                    disabled={bootstrapBusy}
                    className="w-full rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {bootstrapBusy ? 'Verifying token...' : 'Activate installation'}
                  </button>
                </div>
              ) : null}

              {bootStep === 'superadmin' ? (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-white/80 p-3">
                  <p className="text-sm text-gray-700">Step 2: Create the main administrator account for this installation.</p>
                  <button
                    type="button"
                    onClick={() => void recheckBootstrapStatus()}
                    disabled={bootstrapBusy}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {bootstrapBusy ? 'Checking...' : 'Recheck setup'}
                  </button>
                  <input
                    value={superAdminFullName}
                    onChange={(e) => setSuperAdminFullName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Type the super admin’s full display name (e.g. Jane Mwangi)"
                  />
                  <input
                    value={superAdminUsername}
                    onChange={(e) => setSuperAdminUsername(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Choose the login username they will use (letters/numbers, e.g. superadmin)"
                  />
                  <input
                    type="password"
                    value={superAdminPassword}
                    onChange={(e) => setSuperAdminPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Create a strong password (at least 8 characters)"
                  />
                  <input
                    type="password"
                    value={superAdminPasswordConfirm}
                    onChange={(e) => setSuperAdminPasswordConfirm(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Re-enter the same password to confirm"
                  />
                  {superAdminError ? <p className="text-xs text-red-600">{superAdminError}</p> : null}
                  <button
                    type="button"
                    onClick={() => void createBootstrapSuperAdmin()}
                    disabled={bootstrapBusy}
                    className="w-full rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {bootstrapBusy ? 'Creating...' : 'Create superadmin and continue'}
                  </button>
                </div>
              ) : null}

              {bootStep === 'mode' ? (
                <>
                <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-900">How this PC will run</p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <strong>Server</strong> — this computer keeps the data. <strong>Client</strong> — this computer uses
                    another computer on the network; use that computer&apos;s address (not this PC&apos;s{' '}
                    <code className="rounded bg-white/80 px-1">localhost</code>).
                    {typeof window !== 'undefined' && getWorkstationName() ? (
                      <>
                        {' '}
                        This PC&apos;s name on receipts: <strong>{getWorkstationName()}</strong>.
                      </>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-600">
                    One computer only at the shop? Use <strong>Start as Server</strong> below after entering the main
                    administrator password.
                  </p>
                  <button
                    type="button"
                    onClick={() => void chooseClientModeAtBoot()}
                    disabled={bootClientDiscovering}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {bootClientDiscovering ? 'Searching…' : 'Find server on network'}
                  </button>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50/90 p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-800">Or enter the server address yourself</p>
                  <p className="text-xs text-gray-600">Use the full web address, including port (your installer or admin can provide it).</p>
                  <input
                    value={bootClientManualUrl}
                    onChange={(e) => {
                      setBootClientManualUrl(e.target.value);
                      if (bootClientError) setBootClientError('');
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
                    placeholder="http://192.168.1.10:4000"
                    disabled={bootClientManualBusy}
                  />
                  <button
                    type="button"
                    onClick={() => void verifyManualClientUrlAtBoot()}
                    disabled={bootClientManualBusy}
                    className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {bootClientManualBusy ? 'Checking…' : 'Verify and use this URL'}
                  </button>
                </div>

                {bootClientSelected && bootClientServers.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 space-y-2">
                    <p className="text-xs font-medium text-emerald-900">Ready to join as Client</p>
                    <code className="block break-all rounded border border-emerald-100 bg-white px-2 py-1.5 text-xs text-gray-800">
                      {bootClientSelected}
                    </code>
                    <button
                      type="button"
                      onClick={confirmClientModeAtBoot}
                      className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                    >
                      Continue as Client with this server
                    </button>
                  </div>
                ) : null}

                <div className="grid gap-2">
                {bootClientServers.length > 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">Select detected server</p>
                    <div className="max-h-40 overflow-auto space-y-1.5">
                      {bootClientServers.map((s) => {
                        const origin = String(s?.info?.suggestedLanUrl || s?.origin || '');
                        const label = String(s?.info?.workstationName || s?.info?.hostname || s?.hostname || 'POS Server');
                        return (
                          <label
                            key={origin}
                            className="flex items-start gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="boot-client-server"
                              checked={bootClientSelected === origin}
                              onChange={() => setBootClientSelected(origin)}
                              className="mt-0.5"
                            />
                            <span className="text-xs text-gray-700">
                              <strong>{label}</strong>
                              <br />
                              <code className="break-all">{origin}</code>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={confirmClientModeAtBoot}
                        className="rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800"
                      >
                        Continue as Client (selected URL)
                      </button>
                      <button
                        type="button"
                        onClick={() => void chooseClientModeAtBoot()}
                        disabled={bootClientDiscovering}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        Rescan
                      </button>
                    </div>
                  </div>
                ) : null}
                {bootClientError ? <p className="text-xs text-amber-700">{bootClientError}</p> : null}
                </div>
                <div className="border-t pt-3 space-y-2">
                <label className="block text-sm font-medium text-gray-700">Super admin password (for Server mode)</label>
                <input
                  type="password"
                  value={bootServerPassword}
                  onChange={(e) => {
                    setBootServerPassword(e.target.value);
                    if (bootPickerError) setBootPickerError('');
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Enter the super admin account password you created above"
                />
                {bootPickerError ? (
                  <p className="text-xs text-red-600">{bootPickerError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={chooseServerModeAtBoot}
                  disabled={bootServerBusy}
                  className="w-full rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {bootServerBusy ? 'Verifying…' : 'Start as Server'}
                </button>
                </div>
                </>
              ) : null}
              <AppFooter className="pt-4 mt-2 border-t border-gray-200/80" />
            </div>
          </div>
        ) : null}
        <ThemeLoadingOverlay ready={themeBootstrapped} />
        {bootModeReady ? (
          <ClientOnly loader={() => <AuthProvider>{children}</AuthProvider>} />
        ) : null}
        <HotReloadIndicator />
        <Toaster position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
        <script src="https://kit.fontawesome.com/2c15cc0cc7.js" crossOrigin="anonymous" async />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
