'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getApiBaseUrl,
  setApiBaseUrl,
  apiUrl,
  getWorkstationName,
  setWorkstationName,
  getRegisteredDevices,
  addRegisteredDevice,
  removeRegisteredDevice,
  getDeploymentMode,
  setDeploymentMode,
  DEPLOYMENT_SERVER,
  DEPLOYMENT_CLIENT,
  getDiscoveryHttpPort,
  setDiscoveryHttpPort,
  getSuspendedDeviceIds,
  saveSuspendedDeviceIds,
  getWorkstationId,
} from '@/utils/apiClient';
import { discoverPosServers, POS_LAN_UDP_PORT, buildLanHttpScanPortList } from '@/utils/lanDiscovery';
import { isTauriDesktop, setLastNgrokPublicUrl, stopNgrokTunnel } from '@/utils/ngrokBridge';
import { toast } from 'sonner';
import {
  Network,
  Server,
  Laptop,
  Trash2,
  PlugZap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
  Radar,
  Link2,
  Globe,
  PauseCircle,
  PlayCircle,
  Copy,
  BookOpen,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { logButtonClick } from '@/utils/logActivity';

const POS_NETWORK_AUTO_REFRESH_KEY = 'POS_NETWORK_AUTO_REFRESH';
const AUTO_REFRESH_INTERVAL_MS = 10000;
const ONLINE_WINDOW_MS = 45000;

function normalizeBase(raw) {
  const t = String(raw || '').trim().replace(/\/+$/, '');
  return t;
}

function isWorkstationRecentlySeen(lastSeen) {
  if (!lastSeen) return false;
  const ts = Date.parse(String(lastSeen));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= ONLINE_WINDOW_MS;
}

/** Human-readable ago from ISO or SQLite datetime; empty if unparseable. */
function formatLastSeenAgo(lastSeen) {
  if (!lastSeen) return '';
  const ts = Date.parse(String(lastSeen).replace(' ', 'T'));
  if (!Number.isFinite(ts)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function originDedupeKey(originRaw) {
  const b = normalizeBase(originRaw);
  if (!b) return '';
  try {
    const u = new URL(b);
    const host = u.hostname.toLowerCase();
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    return `${local ? '__local__' : host}:${port}`;
  } catch {
    return b.toLowerCase();
  }
}

function rowDedupeKey(row) {
  const wid = String(row.id || '').trim();
  if (wid && !wid.startsWith('http') && wid !== 'this-pc') {
    return `id:${wid}`;
  }
  const mac = String(row.macAddress || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (mac.length >= 8) return `mac:${mac}`;
  const ok = originDedupeKey(row.origin);
  if (ok) return `origin:${ok}`;
  return `fallback:${wid || row.name || 'row'}`;
}

function rowPriority(row) {
  if (row.source === 'registry') return 3;
  if (row.source === 'self') return 2;
  return 1;
}

function mergeRegisteredRows(a, b) {
  const primary = rowPriority(a) >= rowPriority(b) ? a : b;
  const secondary = primary === a ? b : a;
  const ts = (x) => {
    const t = Date.parse(String(x?.lastSeen || '').replace(' ', 'T'));
    return Number.isFinite(t) ? t : 0;
  };
  const bestLast =
    ts(primary) >= ts(secondary)
      ? primary.lastSeen || secondary.lastSeen
      : secondary.lastSeen || primary.lastSeen;
  return {
    ...primary,
    name: primary.name || secondary.name,
    origin: primary.origin || secondary.origin,
    hostname: primary.hostname || secondary.hostname,
    macAddress: primary.macAddress || secondary.macAddress,
    lastSeen: bestLast || primary.lastSeen || secondary.lastSeen,
    suspended: Boolean(primary.suspended || secondary.suspended),
    status:
      primary.status === 'suspended' || secondary.status === 'suspended'
        ? 'suspended'
        : primary.status === 'online' || secondary.status === 'online'
          ? 'online'
          : secondary.status || primary.status,
  };
}

export default function NetworkPage() {
  return (
    <ProtectedRoute requiredRole="super_admin">
      <NetworkPageContent />
    </ProtectedRoute>
  );
}

function NetworkPageContent() {
  const [baseInput, setBaseInput] = useState('');
  const [workstationInput, setWorkstationInput] = useState(() =>
    typeof window !== 'undefined' ? getWorkstationName() : ''
  );
  const [devices, setDevices] = useState([]);
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthDetail, setHealthDetail] = useState('');
  const [testing, setTesting] = useState(false);
  const [deploymentMode, setDeploymentModeState] = useState(() => getDeploymentMode());
  const [pendingDeploymentMode, setPendingDeploymentMode] = useState(() => getDeploymentMode());
  const [discoveryPort, setDiscoveryPortState] = useState(4000);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [foundServers, setFoundServers] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  const [browserOrigin, setBrowserOrigin] = useState('');
  const [suspendedDeviceIds, setSuspendedDeviceIds] = useState([]);
  const [managedWorkstations, setManagedWorkstations] = useState([]);
  const [refreshingMachines, setRefreshingMachines] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [showServerSwitchModal, setShowServerSwitchModal] = useState(false);
  const [serverSwitchPassword, setServerSwitchPassword] = useState('');
  const [serverSwitchBusy, setServerSwitchBusy] = useState(false);
  const [serverSwitchError, setServerSwitchError] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    try {
      if (typeof window === 'undefined') return true;
      const raw = localStorage.getItem(POS_NETWORK_AUTO_REFRESH_KEY);
      return raw !== '0';
    } catch {
      return true;
    }
  });
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000));
  const abortRef = useRef(null);
  const refreshMachinesInFlightRef = useRef(false);

  const refreshFromStorage = useCallback(() => {
    setBaseInput(getApiBaseUrl());
    setWorkstationInput(getWorkstationName());
    setDevices(getRegisteredDevices());
    const currentMode = getDeploymentMode();
    setDeploymentModeState(currentMode);
    setPendingDeploymentMode(currentMode);
    setDiscoveryPortState(getDiscoveryHttpPort());
    setSuspendedDeviceIds(getSuspendedDeviceIds());
  }, []);

  useEffect(() => {
    refreshFromStorage();
    const onBaseChange = () => refreshFromStorage();
    window.addEventListener('pos-api-base-changed', onBaseChange);
    window.addEventListener('pos-deployment-mode-changed', onBaseChange);
    window.addEventListener('pos-discovery-port-changed', onBaseChange);
    window.addEventListener('storage', onBaseChange);
    return () => {
      window.removeEventListener('pos-api-base-changed', onBaseChange);
      window.removeEventListener('pos-deployment-mode-changed', onBaseChange);
      window.removeEventListener('pos-discovery-port-changed', onBaseChange);
      window.removeEventListener('storage', onBaseChange);
    };
  }, [refreshFromStorage]);

  /** Port + LAN URL from API (reflects remote server when client mode). */
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (typeof window !== 'undefined') {
        setBrowserOrigin(window.location.origin);
      }
      const url = apiUrl('/api/server-info');
      fetch(url, { credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled) setServerInfo(d);
        })
        .catch(() => {
          if (!cancelled) setServerInfo(null);
        });
    };
    load();
    window.addEventListener('pos-api-base-changed', load);
    return () => {
      cancelled = true;
      window.removeEventListener('pos-api-base-changed', load);
    };
  }, []);

  const effectiveBaseForTest = normalizeBase(baseInput);

  const testConnection = async () => {
    logButtonClick('Network', 'Test connection', {});
    setTesting(true);
    setHealthStatus(null);
    setHealthDetail('');
    const path = '/api/health';
    const url = effectiveBaseForTest ? `${effectiveBaseForTest}${path}` : path;
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (res.ok && json?.ok && json?.service === 'pos-api') {
        setHealthStatus('ok');
        setHealthDetail(JSON.stringify(json));
        toast.success('Server reachable (POS API health OK)');
      } else {
        setHealthStatus('fail');
        setHealthDetail(res.ok ? text : `${res.status} ${res.statusText}`);
        toast.error('Health check failed or unexpected response');
      }
    } catch (e) {
      setHealthStatus('fail');
      setHealthDetail(e?.message || 'Network error');
      toast.error('Could not reach server');
    } finally {
      setTesting(false);
    }
  };

  const pickBestDiscovered = (list) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const active = list.filter((x) => !suspendedDeviceIds.includes(x.origin));
    if (active.length === 0) return null;
    const udp = active.find((x) => x.via === 'udp');
    return udp || active[0];
  };

  const autoDetectServerForClient = async () => {
    const ports = buildLanHttpScanPortList(Number(discoveryPort) || 4000);
    const list = await discoverPosServers({ httpPort: getDiscoveryHttpPort(), httpPorts: ports });
    setFoundServers(list);
    const picked = pickBestDiscovered(list);
    if (!picked) return null;
    const origin = normalizeBase(picked.info?.suggestedLanUrl || picked.origin);
    setBaseInput(origin);
    setApiBaseUrl(origin);
    return origin;
  };

  const applyDeploymentMode = async (mode) => {
    logButtonClick('Network', `Set deployment mode: ${mode}`, {});
    setDeploymentMode(mode);
    setDeploymentModeState(mode);
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
    if (mode === DEPLOYMENT_SERVER) {
      setApiBaseUrl('');
      setBaseInput('');
      toast.success('Server mode: this PC uses the local API and database.');
    } else {
      try {
        await stopNgrokTunnel();
        setLastNgrokPublicUrl('');
      } catch {
        /* ignore */
      }
      toast.info('Client mode: detecting server on LAN...');
      try {
        const picked = await autoDetectServerForClient();
        if (picked) {
          toast.success(`Client mode ready. Server detected: ${picked}`);
        } else {
          toast.message('No server auto-detected. Run scan or enter URL manually.');
        }
      } catch {
        toast.error('Auto-detection failed. Run scan or enter URL manually.');
      }
    }
  };

  const restartApplication = async () => {
    if (isTauriDesktop()) {
      try {
        const processPluginName = '@tauri-apps/plugin-process';
        const processApi = await import(/* @vite-ignore */ processPluginName);
        if (typeof processApi.relaunch === 'function') {
          await processApi.relaunch();
          return;
        }
      } catch {
        // fall through to browser reload
      }
    }
    window.location.reload();
  };

  const closeServerSwitchModal = () => {
    setShowServerSwitchModal(false);
    setServerSwitchPassword('');
    setServerSwitchError('');
    setServerSwitchBusy(false);
  };

  const confirmServerModeSwitch = async () => {
    const password = serverSwitchPassword.trim();
    if (!password) {
      setServerSwitchError('Super admin password is required.');
      return;
    }
    setServerSwitchBusy(true);
    setServerSwitchError('');
    try {
      const verifyRes = await fetch(apiUrl('/api/auth/verify-admin-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!verifyRes.ok) {
        setServerSwitchError('Super admin verification failed.');
        return;
      }
      closeServerSwitchModal();
      await applyDeploymentMode(DEPLOYMENT_SERVER);
      toast.success('Mode saved. Restarting application...');
      await restartApplication();
    } catch {
      setServerSwitchError('Could not verify super admin password.');
    } finally {
      setServerSwitchBusy(false);
    }
  };

  const saveModeAndRestart = async () => {
    if (pendingDeploymentMode === deploymentMode) {
      toast.message('No mode change detected.');
      return;
    }
    if (pendingDeploymentMode === DEPLOYMENT_SERVER) {
      setShowServerSwitchModal(true);
      setServerSwitchPassword('');
      setServerSwitchError('');
      return;
    }
    await applyDeploymentMode(pendingDeploymentMode);
    toast.success('Mode saved. Restarting application...');
    await restartApplication();
  };

  const saveBase = () => {
    logButtonClick('Network', 'Save API base URL', {});
    const n = normalizeBase(baseInput);
    setApiBaseUrl(n);
    setBaseInput(n);
    toast.success(n ? `API base set to ${n}` : 'Using same-origin API (standalone)');
  };

  const clearBase = () => {
    logButtonClick('Network', 'Clear API base (standalone)', {});
    setBaseInput('');
    setApiBaseUrl('');
    toast.success('Cleared — this app will use the embedded API on this machine');
  };

  const saveWorkstation = () => {
    logButtonClick('Network', 'Save workstation name', {});
    setWorkstationName(workstationInput);
    if (deploymentMode === DEPLOYMENT_SERVER) {
      fetch(apiUrl('/api/admin/network/workstation-name'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workstationInput }),
      }).catch(() => {
        /* ignore */
      });
    }
    toast.success('Workstation name saved');
  };

  const removeDevice = (id) => {
    logButtonClick('Network', 'Remove device entry', {});
    removeRegisteredDevice(id);
    setDevices(getRegisteredDevices());
    toast.success('Removed');
  };

  const saveDiscoveryPort = () => {
    logButtonClick('Network', 'Save discovery HTTP port', {});
    setDiscoveryHttpPort(discoveryPort);
    setDiscoveryPortState(getDiscoveryHttpPort());
    toast.success(`Discovery will scan port ${getDiscoveryHttpPort()}`);
  };

  const applyQuickStandalone = useCallback(() => {
    logButtonClick('Network', 'Quick setup: standalone workstation', {});
    setPendingDeploymentMode(DEPLOYMENT_SERVER);
    setBaseInput('');
    setApiBaseUrl('');
    toast.success(
      'Standalone preset: Server mode and local API (remote URL cleared). Scroll to “This computer” and click Save and restart.',
    );
  }, []);

  const copySuggestedClientUrl = useCallback(async () => {
    const url = serverInfo?.suggestedLanUrl;
    if (!url || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      toast.error('Nothing to copy or clipboard unavailable.');
      return;
    }
    try {
      await navigator.clipboard.writeText(String(url));
      toast.success('Suggested client URL copied. Paste it on other PCs in API server URL, then Save and restart.');
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  }, [serverInfo?.suggestedLanUrl]);

  const runDiscovery = async () => {
    logButtonClick('Network', 'Run LAN discovery', {});
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setScanning(true);
    setFoundServers([]);
    setScanProgress('Starting…');
    try {
      const port = getDiscoveryHttpPort();
      const list = await discoverPosServers({
        httpPort: port,
        httpPorts: buildLanHttpScanPortList(port),
        signal: ac.signal,
        onProgress: (phase, done, total) => {
          if (phase === 'http') {
            setScanProgress(`HTTP scan ${done}/${total}`);
          }
        },
      });
      setFoundServers(list);
      setScanProgress('');
      if (list.length === 0) {
        toast.message('No servers found', {
          description: 'Try another port, check firewall, or enter the URL manually.',
        });
      } else {
        toast.success(`Found ${list.length} server(s)`);
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        toast.message('Scan cancelled');
      } else {
        toast.error(e?.message || 'Discovery failed');
      }
      setScanProgress('');
    } finally {
      setScanning(false);
      abortRef.current = null;
    }
  };

  const applyQuickLanClient = async () => {
    logButtonClick('Network', 'Quick setup: join LAN as client', {});
    setPendingDeploymentMode(DEPLOYMENT_CLIENT);
    toast.info('Client mode selected. Scanning LAN…');
    await runDiscovery();
    toast.message('Pick your server in the list below, click Use this server, then Save and restart.');
  };

  const fetchManagedWorkstations = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/admin/network/workstations'), { credentials: 'include' });
      if (!r.ok) return [];
      const data = await r.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, []);

  const refreshMachines = useCallback(async ({ showSpinner = true } = {}) => {
    if (refreshMachinesInFlightRef.current) return;
    refreshMachinesInFlightRef.current = true;
    if (showSpinner) setRefreshingMachines(true);
    try {
      const port = getDiscoveryHttpPort();
      const [managed, discovered] = await Promise.all([
        fetchManagedWorkstations(),
        discoverPosServers({
          httpPort: port,
          httpPorts: buildLanHttpScanPortList(port),
        }),
      ]);
      setManagedWorkstations(managed);
      setFoundServers(discovered);
      setLastRefreshedAt(new Date().toLocaleTimeString());
    } finally {
      refreshMachinesInFlightRef.current = false;
      if (showSpinner) setRefreshingMachines(false);
    }
  }, [fetchManagedWorkstations]);

  useEffect(() => {
    void refreshMachines({ showSpinner: false });
    if (!autoRefreshEnabled) {
      return;
    }
    setAutoRefreshCountdown(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000));
    const t = window.setInterval(() => {
      void refreshMachines({ showSpinner: false });
      setAutoRefreshCountdown(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000));
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [refreshMachines, autoRefreshEnabled]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const countdownTimer = window.setInterval(() => {
      setAutoRefreshCountdown((prev) => (prev <= 1 ? 1 : prev - 1));
    }, 1000);
    return () => window.clearInterval(countdownTimer);
  }, [autoRefreshEnabled]);

  const toggleAutoRefresh = () => {
    const next = !autoRefreshEnabled;
    setAutoRefreshEnabled(next);
    if (next) {
      setAutoRefreshCountdown(Math.floor(AUTO_REFRESH_INTERVAL_MS / 1000));
    }
    try {
      localStorage.setItem(POS_NETWORK_AUTO_REFRESH_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    toast.message(next ? 'Auto-refresh enabled' : 'Auto-refresh disabled');
  };

  const useDiscoveredServer = (origin) => {
    logButtonClick('Network', 'Use discovered server', { origin });
    const n = normalizeBase(origin);
    setBaseInput(n);
    setApiBaseUrl(n);
    setDeploymentMode(DEPLOYMENT_CLIENT);
    setDeploymentModeState(DEPLOYMENT_CLIENT);
    toast.success(`Using ${n}`);
  };

  const toggleSuspendDevice = (id) => {
    const exists = suspendedDeviceIds.includes(id);
    const next = exists
      ? suspendedDeviceIds.filter((x) => x !== id)
      : [...suspendedDeviceIds, id];
    setSuspendedDeviceIds(next);
    saveSuspendedDeviceIds(next);
    if (!exists && normalizeBase(baseInput) === normalizeBase(id)) {
      setBaseInput('');
      setApiBaseUrl('');
      toast.message('Current server suspended locally. API URL cleared.');
    }
  };

  const setRemoteSuspended = async (workstationId, suspended) => {
    try {
      const r = await fetch(apiUrl(`/api/admin/network/workstations/${workstationId}/suspend`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suspended,
          reason: suspended ? 'Suspended by super admin from Network console' : '',
        }),
      });
      if (!r.ok) throw new Error('Failed');
      toast.success(suspended ? 'Workstation suspended' : 'Workstation resumed');
      void refreshMachines();
    } catch {
      toast.error('Could not update workstation status');
    }
  };

  const thisWorkstationId = getWorkstationId();
  const registeredRows = (() => {
    const out = [];
    if (browserOrigin || serverInfo?.suggestedLanUrl) {
      out.push({
        id: thisWorkstationId || browserOrigin || 'this-pc',
        name: workstationInput || serverInfo?.workstationName || 'This PC',
        origin: browserOrigin || serverInfo?.suggestedLanUrl || '',
        role: deploymentMode,
        hostname: serverInfo?.hostname || '',
        macAddress: serverInfo?.macAddress || '',
        status: 'online',
        source: 'self',
        suspended: false,
      });
    }
    for (const w of managedWorkstations) {
      out.push({
        id: String(w.workstation_id || w.id || ''),
        name: String(w.workstation_name || w.hostname || 'Workstation'),
        origin: String(w.last_url || ''),
        role: String(w.role || 'client'),
        hostname: String(w.hostname || ''),
        macAddress: String(w.mac_address || ''),
        status: Number(w.suspended) === 1 ? 'suspended' : isWorkstationRecentlySeen(w.last_seen_at) ? 'online' : 'offline',
        source: 'registry',
        suspended: Number(w.suspended) === 1,
        lastSeen: String(w.last_seen_at || ''),
      });
    }
    for (const s of foundServers) {
      out.push({
        id: String(s.origin),
        name: String(s.info?.workstationName || s.hostname || 'Server host'),
        origin: String(s.info?.suggestedLanUrl || s.origin || ''),
        role: 'server',
        hostname: String(s.info?.hostname || s.hostname || ''),
        macAddress: String(s.info?.macAddress || ''),
        status: suspendedDeviceIds.includes(s.origin) ? 'suspended' : 'online',
        source: 'scan',
        suspended: suspendedDeviceIds.includes(s.origin),
      });
    }
    const map = new Map();
    for (const row of out) {
      const key = rowDedupeKey(row);
      if (!key) continue;
      if (map.has(key)) {
        map.set(key, mergeRegisteredRows(map.get(key), row));
      } else {
        map.set(key, row);
      }
    }
    return [...map.values()];
  })();

  const liveRows = registeredRows.filter((x) => x.status === 'online');

  useEffect(() => {
    if (!Array.isArray(registeredRows) || registeredRows.length === 0) return;
    const existing = getRegisteredDevices();
    const byId = new Map(existing.map((x) => [String(x.id), x]));
    let changed = false;
    for (const row of registeredRows) {
      const id = rowDedupeKey(row);
      if (!id) continue;
      const nextEntry = {
        id,
        name: String(row.name || row.hostname || 'Workstation'),
        baseUrl: String(row.origin || ''),
        role: String(row.role || 'client'),
        suspended: Boolean(row.suspended || row.status === 'suspended'),
        status: String(row.status || 'offline'),
        lastSeen: String(row.lastSeen || ''),
        addedAt: byId.get(id)?.addedAt || new Date().toISOString(),
      };
      const prev = byId.get(id);
      const prevSig = JSON.stringify(prev || {});
      const nextSig = JSON.stringify({ ...(prev || {}), ...nextEntry });
      if (!prev || prevSig !== nextSig) {
        addRegisteredDevice(nextEntry);
        changed = true;
      }
    }
    if (changed) {
      setDevices(getRegisteredDevices());
    }
  }, [registeredRows]);

  const currentResolvedHealthPreview = apiUrl('/api/health');

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 pb-24 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Network className="h-7 w-7 text-blue-600" />
          Network & deployment
        </h1>
        <p className="text-gray-600 mt-2 text-sm leading-relaxed">
          <strong>Server</strong> = this install hosts the database. <strong>Client</strong> = this PC only talks to
          another machine’s API. Pick one server per site; everyone else uses the same LAN URL (never{' '}
          <code className="rounded bg-gray-100 px-1 text-xs">localhost</code> on a second PC).
        </p>
      </div>

      <div className="space-y-3 rounded-xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/90 to-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-blue-600" />
          Quick setup
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Standalone workstation</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Use when <strong>only this computer</strong> runs the POS and holds the data. Clears any old remote URL and
              selects Server mode — you still confirm with <strong>Save and restart</strong> below.
            </p>
            <button
              type="button"
              onClick={applyQuickStandalone}
              className="w-full rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Use this PC as standalone server
            </button>
          </div>
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Join an existing LAN server</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Use on a <strong>second (or new) PC</strong>. Selects Client mode and scans your network. Then choose{' '}
              <strong>Use this server</strong> on a found host, and <strong>Save and restart</strong>.
            </p>
            <button
              type="button"
              onClick={() => void applyQuickLanClient()}
              disabled={scanning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              Find server on LAN
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          <strong>Stuck?</strong> Server and clients must be on the same network. On the server PC allow inbound TCP on
          your app port (often 4000) in Windows Firewall. If scan finds nothing, type the URL from “Suggested API base”
          manually, then Test connection.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <Globe className="h-5 w-5 text-emerald-700" />
          This app&apos;s addresses
        </h2>
        <p className="text-sm text-gray-600">
          On <strong>other PCs</strong>, set the client API URL to the <strong>LAN address</strong> below (not{' '}
          <code className="text-xs bg-white px-1 rounded">localhost</code>), using the same port the server is running
          on.
        </p>
        {browserOrigin && (
          <div className="text-sm">
            <span className="text-gray-500">This window (browser):</span>{' '}
            <code className="break-all bg-white px-2 py-px rounded border text-gray-900">{browserOrigin}</code>
          </div>
        )}
        {serverInfo && !serverInfo.error && (
          <ul className="text-sm space-y-2 text-gray-800">
            <li>
              <span className="text-gray-500">HTTP port:</span>{' '}
              <code className="font-mono text-gray-900">{serverInfo.port}</code>
            </li>
            <li>
              <span className="text-gray-500">Server LAN IP (API host):</span>{' '}
              <code className="font-mono text-gray-900">{serverInfo.lanIPv4}</code>
            </li>
            <li className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-gray-500 font-medium text-emerald-900">Suggested API base for clients</span>
                {serverInfo.suggestedLanUrl ? (
                  <button
                    type="button"
                    onClick={() => void copySuggestedClientUrl()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy URL
                  </button>
                ) : null}
              </div>
              <code className="block break-all rounded border bg-white px-2 py-1.5 text-gray-900">
                {serverInfo.suggestedLanUrl}
              </code>
            </li>
            {serverInfo.pageUrl ? (
              <li className="text-xs text-gray-500">
                Request host: <code className="break-all">{serverInfo.pageUrl}</code>
              </li>
            ) : null}
            {serverInfo.hostname ? (
              <li className="text-xs text-gray-500">Machine name: {serverInfo.hostname}</li>
            ) : null}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/80 backdrop-blur shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <Server className="h-5 w-5" />
          This computer
        </h2>
        <fieldset className="space-y-3">
          <legend className="sr-only">Deployment role</legend>
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="deploy"
              checked={pendingDeploymentMode === DEPLOYMENT_SERVER}
              onChange={() => setPendingDeploymentMode(DEPLOYMENT_SERVER)}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">Server (database on this PC)</div>
              <p className="text-xs text-gray-600 mt-0.5">
                Uses the API bundled with this app. Clear any remote URL. Other PCs on the LAN connect to this machine’s
                IP and port.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
            <input
              type="radio"
              name="deploy"
              checked={pendingDeploymentMode === DEPLOYMENT_CLIENT}
              onChange={() => setPendingDeploymentMode(DEPLOYMENT_CLIENT)}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">Client (connect to another PC)</div>
              <p className="text-xs text-gray-600 mt-0.5">
                All data goes to a remote server URL. Use discovery or enter the URL manually.
              </p>
            </div>
          </label>
        </fieldset>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">
            Selected mode: <strong>{pendingDeploymentMode}</strong>. Click Save and Restart to apply.
          </p>
          <button
            type="button"
            onClick={() => void saveModeAndRestart()}
            className="rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-medium hover:bg-gray-800"
          >
            Save and restart
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/80 backdrop-blur shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <Info className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <strong className="font-medium">One database per shop.</strong> Only one PC should run in Server mode with
            the live database; others use Client mode and the same server URL.
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            API server URL
          </label>
          <input
            type="url"
            placeholder="http://SERVER-LAN-IP:PORT — e.g. http://192.168.1.50:4000 (on another PC, never localhost)"
            value={baseInput}
            onChange={(e) => setBaseInput(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Empty = same origin (normal for Server mode). Health check URL:{' '}
            <code className="break-all text-gray-700">{currentResolvedHealthPreview}</code>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Test connection
          </button>
          <button
            type="button"
            onClick={saveBase}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Save URL
          </button>
          <button
            type="button"
            onClick={clearBase}
            className="rounded-lg border border-transparent text-gray-600 px-4 py-2 text-sm hover:underline"
          >
            Clear (local API)
          </button>
          {healthStatus === 'ok' && <CheckCircle2 className="h-5 w-5 text-green-600" aria-label="OK" />}
          {healthStatus === 'fail' && <XCircle className="h-5 w-5 text-red-500" aria-label="Failed" />}
        </div>
        {healthDetail && (
          <pre className="text-xs bg-gray-50 border rounded-lg p-3 overflow-x-auto text-gray-800">{healthDetail}</pre>
        )}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/40 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <Radar className="h-5 w-5 text-blue-600" />
          Find servers on LAN
        </h2>
        <p className="text-sm text-gray-600">
          <strong>Tauri (desktop):</strong> sends a UDP broadcast on port {POS_LAN_UDP_PORT} — fast.{' '}
          <strong>Browser:</strong> scans common subnets over HTTP. Allow TCP {discoveryPort} and UDP {POS_LAN_UDP_PORT}{' '}
          through Windows Firewall on the server PC.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">HTTP port to scan</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={discoveryPort}
              onChange={(e) => setDiscoveryPortState(parseInt(e.target.value, 10) || 4000)}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={saveDiscoveryPort}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Save port
          </button>
          <button
            type="button"
            onClick={runDiscovery}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {scanning ? 'Scanning…' : 'Scan network'}
          </button>
          <button
            type="button"
            onClick={() => void refreshMachines({ showSpinner: true })}
            disabled={refreshingMachines}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshingMachines ? 'animate-spin' : ''}`} />
            Refresh list
          </button>
          <button
            type="button"
            onClick={toggleAutoRefresh}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border ${
              autoRefreshEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                autoRefreshEnabled ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
            Auto-refresh: {autoRefreshEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {autoRefreshEnabled ? (
          <p className="text-xs text-gray-500">Next auto-refresh in {autoRefreshCountdown}s</p>
        ) : (
          <p className="text-xs text-gray-400">Auto-refresh is off. Use Refresh list manually.</p>
        )}
        {scanProgress && <p className="text-xs text-gray-600">{scanProgress}</p>}
        {lastRefreshedAt && <p className="text-xs text-gray-500">Last refresh: {lastRefreshedAt}</p>}
        {liveRows.length > 0 && (
          <ul className="divide-y divide-gray-200 border rounded-lg bg-white">
            {liveRows.map((s) => (
              <li key={s.id || s.origin} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <div className="font-mono text-gray-900 flex items-center gap-2">
                    <span>{s.origin || 'n/a'}</span>
                    {s.id === thisWorkstationId ? (
                      <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                        this PC
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(s.role || 'client').toLowerCase()}
                    {s.name ? ` · ${s.name}` : ''}
                    {s.hostname ? ` · ${s.hostname}` : ''}
                    {s.macAddress ? ` · MAC ${s.macAddress}` : ''}
                    {' · '}
                    <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                      {s.status || 'online'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.source === 'registry' ? (
                    <button
                      type="button"
                      onClick={() => setRemoteSuspended(s.id, s.status !== 'suspended')}
                      className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 inline-flex items-center gap-1"
                    >
                      {s.status === 'suspended' ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                      {s.status === 'suspended' ? 'Resume' : 'Suspend'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSuspendDevice(s.origin)}
                      className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 inline-flex items-center gap-1"
                    >
                      {s.status === 'suspended' ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                      {s.status === 'suspended' ? 'Resume' : 'Suspend'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => useDiscoveredServer(s.origin)}
                    disabled={s.status === 'suspended' || !s.origin}
                    className="rounded-md bg-gray-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Use this server
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {liveRows.length === 0 ? <p className="text-sm text-gray-400">No devices are currently online on LAN.</p> : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/80 backdrop-blur shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <Laptop className="h-5 w-5 text-gray-600" />
          This workstation
        </h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display name (local only)</label>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="e.g. Front counter / Back office"
              value={workstationInput}
              onChange={(e) => setWorkstationInput(e.target.value)}
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={saveWorkstation}
              className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
            >
              Save name
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Used for your notes and device list below; not sent to the server.</p>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-800 mb-2">Registered devices (local registry)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Auto-recorded from discovered + managed devices. Offline devices remain here until removed.
          </p>
          {devices.length === 0 ? (
            <p className="text-sm text-gray-400">No entries yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border rounded-lg">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <span>{d.name}</span>
                      <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                        workstation
                      </span>
                      <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                        {d.role || (d.baseUrl ? 'client' : 'server')}
                      </span>
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          d.status === 'online'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.status === 'suspended'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {d.status || 'offline'}
                      </span>
                    </div>
                    {d.baseUrl && <div className="text-xs text-gray-500 break-all">{d.baseUrl}</div>}
                    {d.lastSeen ? (
                      <div className="text-xs text-gray-500">
                        Last seen: {formatLastSeenAgo(d.lastSeen) || String(d.lastSeen)}
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-400">{d.addedAt}</div>
                  </div>
                  {d.suspended ? (
                    <button
                      type="button"
                      onClick={() => removeDevice(d.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Remove"
                      title="Delete suspended device"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showServerSwitchModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl p-5 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Confirm server mode switch</h3>
            <p className="text-sm text-gray-600">
              Enter super admin password to switch this workstation to Server mode.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Super admin password</label>
              <input
                type="password"
                value={serverSwitchPassword}
                onChange={(e) => {
                  setServerSwitchPassword(e.target.value);
                  if (serverSwitchError) setServerSwitchError('');
                }}
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter password"
                disabled={serverSwitchBusy}
              />
              {serverSwitchError ? <p className="mt-2 text-sm text-red-600">{serverSwitchError}</p> : null}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeServerSwitchModal}
                disabled={serverSwitchBusy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmServerModeSwitch()}
                disabled={serverSwitchBusy}
                className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {serverSwitchBusy ? 'Verifying...' : 'Confirm and restart'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
