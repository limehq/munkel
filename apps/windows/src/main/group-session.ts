import {
	deriveGroupKeys,
	seal,
	open,
	encodeChat,
	encodeProfile,
	decodePayload,
	normalizeCircleCode,
} from '../core';
import { RelayClient } from './relay-client';
import { getCircleColor } from '../shared/group-color';
import type { CircleState, Member, NotchMessage } from '../shared/types';
import type { ClientMessage, ServerMessage } from '../core';

export interface GroupSessionCallbacks {
	onStateChange(state: CircleState): void;
	onChat(payload: { sender: string; text: string; isDirect: boolean; sentAt: string }): void;
	onNotch(message: NotchMessage): void;
	onError?(message: string): void;
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

	async sendChat(text: string, to?: string): Promise<boolean> {
		const payload = encodeChat(text);
		const sealed = await seal(JSON.stringify(payload), this.messageKey);
		return this.send({ type: 'send', payload: sealed, to }, to);
	}

	async sendProfile(to?: string): Promise<boolean> {
		const payload = encodeProfile(this.identity.displayName, this.identity.avatar);
		const sealed = await seal(JSON.stringify(payload), this.messageKey);
		return this.send({ type: 'send', payload: sealed, to }, to);
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

					if (decoded.kind === 'chat') {
						const sender = this.members.find((m) => m.memberId === frame.from);
						const senderLabel = sender?.displayName ?? frame.from;
						const isDirect = frame.to !== undefined;
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
							groupColor: getCircleColor(this.code),
						});
					} else if (decoded.kind === 'profile') {
						const index = this.members.findIndex((m) => m.memberId === frame.from);
						if (index >= 0) {
							this.members[index].displayName = decoded.displayName;
							if (decoded.avatar !== undefined) {
								this.members[index].avatar = decoded.avatar;
							}
						} else {
							this.members.push({
								memberId: frame.from,
								displayName: decoded.displayName,
								avatar: decoded.avatar,
								joinedAt: new Date().toISOString(),
							});
						}
						this.callbacks.onStateChange(this.toState());
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
