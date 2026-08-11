import { sha256 as nobleSha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Computes the SHA-256 hash of the given data (strings are UTF-8 encoded) and
 * returns it as a lowercase hex string. Works in both Node and the browser;
 * Node-only code should prefer `createHash` from `node:crypto`.
 */
export function sha256(data: string | Uint8Array): string {
  return bytesToHex(nobleSha256(data));
}
