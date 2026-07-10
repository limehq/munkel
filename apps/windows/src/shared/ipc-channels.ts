/**
 * Single source of truth for all renderer ↔ main-process IPC channel names.
 *
 * Keep this file in sync with `apps/windows/docs/ipc-contract.md`.
 */

/** Renderer → main invoke channels. */
export const IPC_CHANNELS = {
  GET_WINDOW_TYPE: 'get-window-type',
  HIDE_WINDOW: 'hide-window',
  SHOW_PALETTE: 'show-palette',
  TOGGLE_MENU: 'toggle-menu',
  MENU_PICKER_STATE: 'menu-picker-state',
  QUIT_APP: 'quit-app',

  JOIN_CIRCLE: 'join-circle',
  LEAVE_CIRCLE: 'leave-circle',
  SEND_CHAT: 'send-chat',
  SEND_IMAGES: 'send-images',
  UPDATE_PROFILE: 'update-profile',
  SET_RELAY_URL: 'set-relay-url',
  GET_STATE: 'get-state',
  SELECT_IMAGES: 'select-images',
  SAVE_CLIPBOARD_IMAGE: 'save-clipboard-image',
  GITHUB_LOGOUT: 'github-logout',

  START_GITHUB_LOGIN: 'start-github-login',
  CANCEL_GITHUB_LOGIN: 'cancel-github-login',

  CHECK_FOR_UPDATES: 'check-for-updates',
  INSTALL_UPDATE: 'install-update',

  GET_LAUNCH_AT_LOGIN: 'get-launch-at-login',
  SET_LAUNCH_AT_LOGIN: 'set-launch-at-login',

  NOTCH_BEGIN_REPLY: 'notch-begin-reply',
  NOTCH_END_REPLY: 'notch-end-reply',
  NOTCH_SET_INTERACTIVE: 'notch-set-interactive',
  NOTCH_EMPTY: 'notch-empty',
  NOTCH_RESIZE: 'notch-resize',
  NOTCH_SET_HOVER_COPY: 'notch-set-hover-copy',

  GET_AUTO_UPDATE_CHECK: 'get-auto-update-check',
  SET_AUTO_UPDATE_CHECK: 'set-auto-update-check',

  GET_PALETTE_HOTKEY: 'get-palette-hotkey',
  SET_PALETTE_HOTKEY: 'set-palette-hotkey',

  // Dev-only flag (Plan 13 items 5–6): backed by `!app.isPackaged` in main.ts
  // (NOT an env var like NODE_ENV, which a launcher could spoof to unlock the
  // toggles in a release build). Gates the two dev-only settings-popover
  // toggles below so release builds never render or persist them.
  GET_IS_DEV: 'get-is-dev',

  GET_ALLOW_IN_SCREENSHOTS: 'get-allow-in-screenshots',
  SET_ALLOW_IN_SCREENSHOTS: 'set-allow-in-screenshots',

  GET_DEV_ECHO_BROADCASTS: 'get-dev-echo-broadcasts',
  SET_DEV_ECHO_BROADCASTS: 'set-dev-echo-broadcasts',
} as const;

/** Main → renderer push channels. */
export const PUSH_CHANNELS = {
  STATE_UPDATE: 'state-update',
  GITHUB_LOGIN_STATE: 'github-login-state',
  UPDATE_STATE: 'update-state',
  NOTCH_MESSAGE: 'notch-message',
  NOTCH_SHOW: 'notch-show',
  NOTCH_HIDE: 'notch-hide',
  NOTCH_UPDATE: 'notch-update',
  NOTCH_REOPEN: 'notch-reopen',
  NOTCH_COPY_HOVERED: 'notch-copy-hovered',
  RELAY_ERROR: 'relay-error',
  GLOBAL_SHORTCUT: 'global-shortcut',
} as const;
