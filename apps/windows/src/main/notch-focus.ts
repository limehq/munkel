type NotchFocusWindow = {
	setFocusable(value: boolean): void;
	show(): void;
	focus(): void;
	blur(): void;
};

/** Make the notch key so the inline reply field can receive keyboard input. */
export function focusNotchForReply(win: NotchFocusWindow | null): void {
	if (!win) return;
	win.setFocusable(true);
	win.show();
	win.focus();
}

/** Restore non-activating notification behavior after reply closes. */
export function unfocusNotchAfterReply(win: NotchFocusWindow | null): void {
	if (!win) return;
	win.blur();
	win.setFocusable(false);
}
