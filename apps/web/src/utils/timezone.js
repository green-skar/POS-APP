import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from './apiClient';

const TIMEZONE_CACHE_KEY = 'app-timezone-settings';
const DEFAULT_DATETIME_LOCALE =
  (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
const DEFAULT_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

function normalizeTimezone(raw) {
  const mode = raw?.mode === 'manual' ? 'manual' : 'auto';
  const value = String(raw?.value || DEFAULT_TIMEZONE);
  const detected = String(raw?.detected || DEFAULT_TIMEZONE);
  const effective = String(raw?.effective || (mode === 'manual' ? value : detected) || DEFAULT_TIMEZONE);
  const dateTimeLocale = String(raw?.dateTimeLocale || DEFAULT_DATETIME_LOCALE).trim() || DEFAULT_DATETIME_LOCALE;
  return { mode, value, detected, effective, dateTimeLocale };
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') return new Date(value);
  const s = value.trim();
  if (!s) return new Date(s);

  const sqliteNoTz = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
  if (sqliteNoTz.test(s)) {
    return new Date(`${s.replace(' ', 'T')}Z`);
  }

  const isoNoTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
  if (isoNoTz.test(s)) {
    return new Date(`${s}Z`);
  }

  return new Date(s);
}

export function readTimezoneFromStorage() {
  if (typeof window === 'undefined') return normalizeTimezone(null);
  try {
    const raw = localStorage.getItem(TIMEZONE_CACHE_KEY);
    if (!raw) return normalizeTimezone(null);
    return normalizeTimezone(JSON.parse(raw));
  } catch {
    return normalizeTimezone(null);
  }
}

export function writeTimezoneToStorage(value) {
  if (typeof window === 'undefined') return;
  const next = normalizeTimezone(value);
  localStorage.setItem(TIMEZONE_CACHE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('timezone-changed'));
}

export async function fetchTimezoneSettings() {
  try {
    const res = await apiFetch('/api/settings/timezone', { method: 'GET', credentials: 'omit' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const next = normalizeTimezone(data);
    writeTimezoneToStorage(next);
    return next;
  } catch {
    return null;
  }
}

export function formatDateTimeInAppTimezone(dateInput, timezoneSettings) {
  const d = toDate(dateInput);
  const tz = normalizeTimezone(timezoneSettings || readTimezoneFromStorage());
  try {
    return new Intl.DateTimeFormat(tz.dateTimeLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz.effective,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function formatDateInAppTimezone(dateInput, timezoneSettings) {
  const d = toDate(dateInput);
  const tz = normalizeTimezone(timezoneSettings || readTimezoneFromStorage());
  try {
    return new Intl.DateTimeFormat(tz.dateTimeLocale, {
      dateStyle: 'medium',
      timeZone: tz.effective,
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatWithTimezone(dateInput, options = {}, timezoneSettings) {
  const d = toDate(dateInput);
  const tz = normalizeTimezone(timezoneSettings || readTimezoneFromStorage());
  try {
    return new Intl.DateTimeFormat(tz.dateTimeLocale, {
      ...options,
      timeZone: tz.effective,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function useTimezoneSettings() {
  const [timezone, setTimezone] = useState(() => readTimezoneFromStorage());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchTimezoneSettings();
      if (!cancelled && next) setTimezone(next);
    })();

    const onChange = () => setTimezone(readTimezoneFromStorage());
    window.addEventListener('timezone-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('timezone-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const formatDateTime = useMemo(
    () => (value) => formatDateTimeInAppTimezone(value, timezone),
    [timezone]
  );
  const formatDate = useMemo(
    () => (value) => formatDateInAppTimezone(value, timezone),
    [timezone]
  );
  const formatCustom = useMemo(
    () => (value, options = {}) => formatWithTimezone(value, options, timezone),
    [timezone]
  );

  return { timezone, formatDateTime, formatDate, formatCustom };
}

