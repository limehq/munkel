import type { CircleCodeCodec } from './identity-store';

export interface SafeStorageLike {
	isEncryptionAvailable(): boolean;
	encryptString(plain: string): Buffer;
	decryptString(encrypted: Buffer): string;
}

export function createSafeStorageCodec(storage: SafeStorageLike): CircleCodeCodec {
	return {
		isAvailable: () => {
			try {
				return storage.isEncryptionAvailable();
			} catch {
				return false;
			}
		},
		encrypt: (plain) => {
			try {
				return storage.isEncryptionAvailable() ? storage.encryptString(plain).toString('base64') : null;
			} catch {
				return null;
			}
		},
		decrypt: (stored) => {
			try {
				return storage.decryptString(Buffer.from(stored, 'base64'));
			} catch {
				return null;
			}
		},
	};
}
