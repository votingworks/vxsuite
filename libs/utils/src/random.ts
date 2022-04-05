/**
 * Random Base64 string.
 * Get random values to fill an array of prescribed length,
 * b64 encode it, and strip the '=' at the end.
 *
 * @param numBytes Number of bytes
 *
 * @return string
 *
 */
import randomBytes from 'randombytes';

export function randomBase64(numBytes: number): string {
  return window
    .btoa(String.fromCharCode(...randomBytes(numBytes)))
    .replace(/=+$/, '');
}
