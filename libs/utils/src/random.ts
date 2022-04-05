import { fromByteArray } from 'base64-js';
import randomBytes from 'randombytes';

/**
 * Random ballot ID as a base64 string without the `=` padding.
 */
export function randomBallotId(numBytes = 10): string {
  return fromByteArray(randomBytes(numBytes)).replace(/=+$/, '');
}
