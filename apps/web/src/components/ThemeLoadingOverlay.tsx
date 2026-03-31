'use client';

import type { ReactNode } from 'react';

/**
 * Full-screen gate while the shop theme is fetched from the server (LAN / same-origin).
 * Infinity motif + skeleton shimmer — fades out when `ready` is true.
 */
export default function ThemeLoadingOverlay({
  ready,
}: {
  ready: boolean;
}): ReactNode {
  return (
    <div
      className={`theme-loading-gate fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-10 px-6 transition-opacity duration-[480ms] ease-out ${
        ready ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-hidden={ready}
      aria-busy={!ready}
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(15, 23, 42, 0.94) 0%, rgba(15, 23, 42, 0.98) 55%, #020617 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="theme-orb absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="theme-orb absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl animation-delay-500" />
      </div>

      <div className="relative flex flex-col items-center gap-8">
        {/* Infinity symbol — animated stroke */}
        <div className="theme-infinity-wrap relative flex h-28 w-44 items-center justify-center sm:h-32 sm:w-52">
          <svg
            className="theme-infinity-svg h-full w-full"
            viewBox="0 0 120 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <defs>
              <linearGradient id="themeInfinityGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            {/* Lemniscate-style ∞ (approx) */}
            <path
              className="theme-infinity-path"
              d="M 15 30 C 15 8 48 8 60 30 C 72 52 105 52 105 30 C 105 8 72 8 60 30 C 48 52 15 52 15 30"
              stroke="url(#themeInfinityGrad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="theme-infinity-core text-4xl font-light tracking-tight text-white/90 sm:text-5xl">
              ∞
            </span>
          </div>
        </div>

        <div className="max-w-sm text-center">
          <p className="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">Shop theme</p>
          <p className="mt-1 text-lg font-semibold text-white/95">Syncing your experience</p>
        </div>

        {/* Skeleton mimic of a shell UI */}
          <div className="theme-skeleton-board w-full max-w-md space-y-3 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl">
          <div className="theme-skel-line h-3 w-[60%] rounded-full bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200" />
          <div className="theme-skel-line animation-delay-150 h-3 w-full rounded-full bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200" />
          <div className="theme-skel-line animation-delay-300 h-3 w-4/5 rounded-full bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="theme-skel-line animation-delay-100 h-16 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300" />
            <div className="theme-skel-line animation-delay-200 h-16 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300" />
            <div className="theme-skel-line animation-delay-300 h-16 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300" />
          </div>
        </div>
      </div>

      <style>{`
        .theme-infinity-path {
          stroke-dasharray: 40 200;
          animation: theme-infinity-dash 2.2s ease-in-out infinite;
        }
        .theme-infinity-svg {
          filter: drop-shadow(0 0 12px rgba(34, 211, 238, 0.35));
          animation: theme-infinity-glow 2.5s ease-in-out infinite;
        }
        .theme-infinity-core {
          animation: theme-infinity-pulse 2s ease-in-out infinite;
          text-shadow: 0 0 24px rgba(167, 139, 250, 0.5);
        }
        .theme-skel-line {
          background-size: 200% 100%;
          animation: theme-skel-shimmer 1.4s ease-in-out infinite;
        }
        .animation-delay-100 { animation-delay: 0.1s; }
        .animation-delay-150 { animation-delay: 0.15s; }
        .animation-delay-200 { animation-delay: 0.2s; }
        .animation-delay-300 { animation-delay: 0.3s; }
        .animation-delay-500 { animation-delay: 0.5s; }
        @keyframes theme-infinity-dash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -240; }
        }
        @keyframes theme-infinity-glow {
          0%, 100% { filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.4)); opacity: 1; }
          50% { filter: drop-shadow(0 0 22px rgba(167, 139, 250, 0.55)); opacity: 0.92; }
        }
        @keyframes theme-infinity-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes theme-skel-shimmer {
          0% { background-position: 200% 0; opacity: 0.65; }
          50% { opacity: 1; }
          100% { background-position: -200% 0; opacity: 0.65; }
        }
        .theme-orb {
          animation: theme-orb-float 8s ease-in-out infinite;
        }
        .theme-orb.animation-delay-500 {
          animation-delay: 0.5s;
        }
        @keyframes theme-orb-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(10px, -12px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
