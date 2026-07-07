export const isDebugTray = () =>
  process.env.MUNKEL_DEBUG_TRAY === '1' || process.env.NODE_ENV === 'development';

export const debugTray = (...args: unknown[]) => {
  if (isDebugTray()) console.log('[tray]', ...args);
};

export const debugMenu = (...args: unknown[]) => {
  if (isDebugTray()) console.log('[menu]', ...args);
};

export const debugGuard = (...args: unknown[]) => {
  if (isDebugTray()) console.log('[guard]', ...args);
};
