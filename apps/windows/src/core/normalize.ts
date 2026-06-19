/**
 * Spec normalization: Unicode NFC, trim whitespace, lowercase.
 *
 * @throws {Error} when the code is empty after trimming.
 */
export function normalizeCircleCode(code: string): string {
  const normalized = code.normalize('NFC').trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error('Circle code is empty after normalization');
  }
  return normalized;
}
