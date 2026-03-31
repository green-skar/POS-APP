/**
 * Server-side theme persistence + client URL rewriting for remote API assets.
 */

import { apiFetch, apiUrl, getDeploymentMode, DEPLOYMENT_CLIENT } from "./apiClient";

/**
 * Rewrite root-relative background URLs so they load from the API host (client mode).
 * @param {object} theme
 * @param {string} baseUrl API origin without trailing slash
 */
export function rewriteThemeAssetsForClient(theme, baseUrl) {
  if (!theme || !baseUrl) return theme;
  const b = String(baseUrl).replace(/\/+$/, "");
  const next = { ...theme };
  if (next.background?.texture && typeof next.background.texture === "string") {
    const t = next.background.texture;
    if (t.startsWith("/") && !t.startsWith("//") && !t.startsWith("data:")) {
      next.background = { ...next.background, texture: `${b}${t}` };
    }
  }
  return next;
}

/** Push theme JSON to server DB (admin session). */
export async function persistThemeToServer(theme) {
  try {
    const res = await apiFetch("/api/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[themeSync] PUT /api/theme failed:", res.status, err);
    }
  } catch (e) {
    console.warn("[themeSync] persistThemeToServer:", e);
  }
}

/** Remove server-stored theme (admin). */
export async function clearThemeOnServer() {
  try {
    await apiFetch("/api/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: null }),
    });
  } catch (e) {
    console.warn("[themeSync] clearThemeOnServer:", e);
  }
}

/**
 * Fetch public theme from API (no auth). Uses apiUrl when remote base is set.
 */
export async function fetchServerThemeJson() {
  const localPath = "/api/theme";
  const remoteUrl = apiUrl(localPath);

  // In client mode, prioritize configured remote API base so this machine
  // reflects the server's theme; in server mode, prefer same-origin first.
  const isClientMode = getDeploymentMode() === DEPLOYMENT_CLIENT;
  const hasRemote = Boolean(remoteUrl && remoteUrl !== localPath);
  const candidates = hasRemote
    ? (isClientMode ? [remoteUrl, localPath] : [localPath, remoteUrl])
    : [localPath];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (data) return data;
    } catch {
      // Try the next candidate URL.
    }
  }

  return null;
}
