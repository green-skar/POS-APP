import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from './apiClient';

const CURRENCY_CACHE_KEY = 'app-currency-settings';
const DEFAULT_CURRENCY = { code: 'USD', locale: 'en-US' };

function normalizeCurrency(raw) {
  const code = String(raw?.code || DEFAULT_CURRENCY.code).trim().toUpperCase() || DEFAULT_CURRENCY.code;
  const locale = String(raw?.locale || DEFAULT_CURRENCY.locale).trim() || DEFAULT_CURRENCY.locale;
  return { code, locale };
}

export function readCurrencyFromStorage() {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  try {
    const raw = localStorage.getItem(CURRENCY_CACHE_KEY);
    if (!raw) return DEFAULT_CURRENCY;
    return normalizeCurrency(JSON.parse(raw));
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function writeCurrencyToStorage(value) {
  if (typeof window === 'undefined') return;
  const next = normalizeCurrency(value);
  localStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('currency-changed'));
}

export async function fetchCurrencySettings() {
  try {
    const res = await apiFetch('/api/settings/currency', { method: 'GET', credentials: 'omit' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const next = normalizeCurrency(data);
    writeCurrencyToStorage(next);
    return next;
  } catch {
    return null;
  }
}

export function formatCurrency(amount, settings) {
  const safe = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const c = normalizeCurrency(settings || DEFAULT_CURRENCY);
  try {
    return new Intl.NumberFormat(c.locale, {
      style: 'currency',
      currency: c.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${c.code} ${safe.toFixed(2)}`;
  }
}

export function useCurrencySettings() {
  const [currency, setCurrency] = useState(() => readCurrencyFromStorage());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchCurrencySettings();
      if (!cancelled && next) setCurrency(next);
    })();

    const onChange = () => {
      setCurrency(readCurrencyFromStorage());
    };
    window.addEventListener('currency-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('currency-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const formatMoney = useMemo(
    () => (amount) => formatCurrency(amount, currency),
    [currency]
  );

  return { currency, formatMoney, setCurrency: writeCurrencyToStorage };
}
