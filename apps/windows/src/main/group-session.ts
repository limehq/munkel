import {
	deriveGroupKeys,
	seal,
	open,
	sealRaw,
	encodeChat,
	encodeProfile,
	encodeImage,
	decodePayload,
	assertPayloadFits,
	PayloadError,
	normalizeCircleCode,
	imageCodec,
	perThumbBudget,
	MAX_IMAGES_PER_MESSAGE,
	uploadBlob,
	generateBlobKey,
} from '../core';
import type { ImageItem } from '../core';
import { readFile } from 'node:fs/promises';
import { RelayClient } from './relay-client';
import { getCircleColor } from '../shared/group-color';
import type { CircleState, IncomingImage, Member, NotchMessage } from '../shared/types';
import type { ChatPayload, ClientMessage, ProfilePayload, ServerMessage } from '../core';

/**
 * Result of a GroupSession send. Surfaced all the way to the renderer
 * so the inline-error UI can distinguish "too long" from "offline".
 */
export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Carried by the optional `onImage` callback when an incoming image
 * album frame is received. The notch already gets a `NotchMessage`
 * with `images?` populated; `onImage` is for callers that want to
 * differentiate text from image (e.g. AppState routing).
 */
export interface ImageMessage {
	sender: string;
	images: IncomingImage[];
	caption: string;
	isDirect: boolean;
	sentAt: string;
	group: string;
	groupColor: string;
}

export interface GroupSessionCallbacks {
	onStateChange(state: CircleState): void;
	onChat(payload: { sender: string; text: string; isDirect: boolean; sentAt: string }): void;
	onNotch(message: NotchMessage): void;
	onImage?(message: ImageMessage): void;
	onError?(message: string): void;
	/**
	 * Current joined-list index for this circle. Read at every call site
	 * (not stored on the session) so the color follows the live joined
	 * order after `leaveCircle` / `setRelayUrl`.
	 */
	getColorIndex(): number;
}

export class GroupSession {
	readonly code: string;
	readonly groupId: string;
	readonly relayClient: RelayClient;
	members: Member[] = [];
	isConnected = false;

	private readonly messageKey: CryptoKey;
	private identity: { displayName: string; avatar?: string };
	private readonly callbacks: GroupSessionCallbacks;
	private readonly relayUrl: string;
	private readonly memberId: string;

	static async create(
		code: string,
		relayUrl: string,
		memberId: string,
		identity: { displayName: string; avatar?: string },
		callbacks: GroupSessionCallbacks,
	): Promise<GroupSession> {
		const normalized = normalizeCircleCode(code);
		const { groupId, messageKey } = await deriveGroupKeys(normalized);
		return new GroupSession(normalized, groupId, relayUrl, memberId, messageKey, identity, callbacks);
	}

	private constructor(
		code: string,
		groupId: string,
		relayUrl: string,
		memberId: string,
		messageKey: CryptoKey,
		identity: { displayName: string; avatar?: string },
		callbacks: GroupSessionCallbacks,
	) {
		this.code = code;
		this.groupId = groupId;
		this.relayUrl = relayUrl;
		this.memberId = memberId;
		this.messageKey = messageKey;
		this.identity = identity;
		this.callbacks = callbacks;
		this.relayClient = new RelayClient(relayUrl, groupId, memberId);
		this.attachListeners();
	}

	connect(): void {
		this.relayClient.connect();
	}

	disconnect(): void {
		this.relayClient.disconnect();
	}

	updateIdentity(identity: { displayName: string; avatar?: string }): void {
		this.identity = identity;
	}

	/**
	 * Seal `text` and dispatch it. Returns the wire-send result as a
	 * discriminated union so callers can show a user-facing error for
	 * "too long" / sealing failures vs. an opaque relay-disconnect.
	 */
	async sendChat(text: string, to?: string): Promise<SendResult> {
		return this.sendPayload(encodeChat(text), to);
	}

	async sendProfile(to?: string): Promise<SendResult> {
		return this.sendPayload(encodeProfile(this.identity.displayName, this.identity.avatar), to);
	}

	/**
	 * Send an image album (1–MAX_IMAGES_PER_MESSAGE images). Mirrors
	 * `MunkelKit/GroupSession.swift:sendImages(_:caption:to:)`:
	 *
	 * For each path:
	 *   1. Read + AVIF-transcode the source via `imageCodec.prepareFull`
	 *      (downsample to MAX_FULL_PIXELS, encode to fit MAX_FULL_BYTES).
	 *   2. Seal the AVIF bytes with `messageKey`.
	 *   3. PUT sealed bytes to `<relay>/blob/<groupId>/<r2Key>`.
	 *   4. Make an inline thumbnail via `imageCodec.makeThumbnail`
	 *      (fits `perThumbBudget(imageCount)` bytes).
	 *   5. Assemble the `ImageItem` (r2Key, mime, dims, byteLen, thumb).
	 *
	 * Then seal the `ImagePayload` JSON with `messageKey`, clamp, and
	 * relay. Returns the standard `SendResult`.
	 */
	async sendImages(imagePaths: string[], caption: string = '', to?: string): Promise<SendResult> {
		if (imagePaths.length === 0) {
			return { ok: false, error: 'No images provided' };
		}
		if (imagePaths.length > MAX_IMAGES_PER_MESSAGE) {
			imagePaths = imagePaths.slice(0, MAX_IMAGES_PER_MESSAGE);
		}

		// Pre-clamp so per-thumb budget accounts for the final album size.
		const perThumb = perThumbBudget(imagePaths.length);
		const items: ImageItem[] = [];

		for (const path of imagePaths) {
			let source: Uint8Array;
			try {
				source = await readFile(path);
			} catch (err) {
				return {
					ok: false,
					error: `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`,
				};
			}

			const full = await imageCodec.prepareFull(source);
			if (!full) {
				return { ok: false, error: `Could not encode ${path}` };
			}

			const sealedFull = await sealRaw(full.data, this.messageKey);
			const r2Key = generateBlobKey();
			const upload = await uploadBlob(this.relayUrl, this.groupId, r2Key, sealedFull);
			if (!upload.ok) {
				return { ok: false, error: upload.error ?? 'Blob upload failed' };
			}

			const thumb = await imageCodec.makeThumbnail(source, perThumb);
			if (!thumb) {
				return { ok: false, error: `Could not thumbnail ${path}` };
			}

			items.push({
				r2Key,
				mime: 'image/avif',
				width: full.width,
				height: full.height,
				byteLen: sealedFull.byteLength,
				thumb: Buffer.from(thumb.data).toString('base64'),
			});
		}

		return this.sendPayload(encodeImage(items, caption), to);
	}

	private async sendPayload(payload: ChatPayload | ProfilePayload | { kind: 'image'; items: ImageItem[]; caption: string; sentAt: string }, to?: string): Promise<SendResult> {
		let sealed: string;
		try {
			const json = JSON.stringify(payload);
			// Clamp after sealing: AES-GCM overhead is fixed (12-byte nonce
			// + 16-byte tag → 28 bytes ≈ 38 base64 chars), so the sealed
			// length tracks plaintext length closely. Clamping the sealed
			// string is the actual wire check.
			sealed = await seal(json, this.messageKey);
			assertPayloadFits(sealed);
		} catch (err) {
			const message = err instanceof PayloadError ? err.message : 'Could not seal message';
			return { ok: false, error: message };
		}
		const wireOk = this.send({ type: 'send', payload: sealed, to }, to);
		return wireOk
			? { ok: true }
			: { ok: false, error: 'Circle offline — message not sent.' };
	}

	toState(): CircleState {
		return {
			code: this.code,
			groupId: this.groupId,
			isConnected: this.isConnected,
			members: this.members,
			relayUrl: this.relayUrl,
		};
	}

	private send(message: ClientMessage, _to?: string): boolean {
		return this.relayClient.send(message);
	}

	private attachListeners(): void {
		this.relayClient.on('frame', (frame: ServerMessage) => {
			void this.handleFrame(frame);
		});

		this.relayClient.on('disconnected', () => {
			this.isConnected = false;
			this.callbacks.onStateChange(this.toState());
		});

		this.relayClient.on('error', (err: Error) => {
			this.callbacks.onError?.(err.message);
		});
	}

	private async handleFrame(frame: ServerMessage): Promise<void> {
		switch (frame.type) {
			case 'welcome': {
				this.isConnected = true;
				const known = new Map(this.members.map((m) => [m.memberId, m]));
				const seen = new Set<string>();
				this.members = frame.members
					.filter((memberId) => {
						if (seen.has(memberId)) return false;
						seen.add(memberId);
						return true;
					})
					.map((memberId) => {
						return (
							known.get(memberId) ?? {
								memberId,
								joinedAt: new Date().toISOString(),
							}
						);
					});
				this.callbacks.onStateChange(this.toState());
				await this.sendProfile();
				break;
			}

			case 'peer-joined': {
				if (!this.members.some((m) => m.memberId === frame.memberId)) {
					this.members.push({
						memberId: frame.memberId,
						joinedAt: new Date().toISOString(),
					});
				}
				this.callbacks.onStateChange(this.toState());
				await this.sendProfile(frame.memberId);
				break;
			}

			case 'peer-left': {
				this.members = this.members.filter((m) => m.memberId !== frame.memberId);
				this.callbacks.onStateChange(this.toState());
				break;
			}

			case 'message': {
				try {
					const plaintext = await open(frame.payload, this.messageKey);
					const decoded = decodePayload(plaintext);

					// Resolve the sender label + direct/broadcast flag once —
					// shared by the chat, profile, and image branches below.
					const senderRecord = this.members.find((m) => m.memberId === frame.from);
					const senderLabel = senderRecord?.displayName ?? frame.from;
					const isDirect = frame.to !== undefined;
					const colorIndex = this.callbacks.getColorIndex();

					if (decoded.kind === 'chat') {
						this.callbacks.onChat({
							sender: senderLabel,
							text: decoded.text,
							isDirect,
							sentAt: decoded.sentAt,
						});
						this.callbacks.onNotch({
							sender: senderLabel,
							text: decoded.text,
							isDirect,
							group: this.code,
							groupColor: getCircleColor(colorIndex),
						});
					} else if (decoded.kind === 'profile') {
						const index = this.members.findIndex((m) => m.memberId === frame.from);
						if (index >= 0) {
							this.members[index].displayName = decoded.displayName;
							if (decoded.avatar !== undefined) {
								this.members[index].avatar = decoded.avatar;
							} else {
								// Sender explicitly cleared their avatar (relay
								// sends `{kind:'profile', displayName}` with no
								// `avatar` key). macOS already honors this; the
								// Windows side used to keep the stale avatar.
								delete this.members[index].avatar;
							}
						} else {
							this.members.push({
								memberId: frame.from,
								displayName: decoded.displayName,
								...(decoded.avatar !== undefined ? { avatar: decoded.avatar } : {}),
								joinedAt: new Date().toISOString(),
							});
						}
						this.callbacks.onStateChange(this.toState());
					} else if (decoded.kind === 'image') {
						const images: IncomingImage[] = decoded.items.map((it) => ({
							id: it.r2Key,
							thumb: it.thumb,
							width: it.width,
							height: it.height,
						}));
						if (this.callbacks.onImage) {
							this.callbacks.onImage({
								sender: senderLabel,
								images,
								caption: decoded.caption,
								isDirect,
								sentAt: decoded.sentAt,
								group: this.code,
								groupColor: getCircleColor(colorIndex),
							});
						}
						this.callbacks.onNotch({
							sender: senderLabel,
							text: decoded.caption || `Sent ${images.length} image${images.length === 1 ? '' : 's'}`,
							isDirect,
							group: this.code,
							groupColor: getCircleColor(colorIndex),
							images,
						});
					}
				} catch (err) {
					console.error('[group-session] dropping undecryptable payload:', err);
				}
				break;
			}

			case 'pong': {
				break;
			}

			case 'error': {
				console.error('[group-session] relay error:', frame.code, frame.message);
				break;
			}

			default: {
				// Unknown frame type; ignore.
				break;
			}
		}
	}
}
