// Tray/menu debug logging is opt-in via an explicit env flag only. The old
// `NODE_ENV === 'development'` branch was dropped (Plan 13 review): it's the
// env-spoofable dev-gate class, and keeping this module electron-free (no
// `app.isPackaged` import — it's a tiny DI-free logging helper) is worth more
// than auto-verbose-in-dev. A developer who wants tray logs sets
// MUNKEL_DEBUG_TRAY=1. This is logging only, not security-sensitive.
export const isDebugTray = () => process.env.MUNKEL_DEBUG_TRAY === '1';

export const debugTray = (...args: unknown[]) => {
  if (isDebugTray()) console.log('[tray]', ...args);
};

export const debugMenu = (...args: unknown[]) => {
  if (isDebugTray()) console.log('[menu]', ...args);
};

export const debugGuard = (...args: unknown[]) => {
  if (isDebugTray()) console.log('[guard]', ...args);
};
