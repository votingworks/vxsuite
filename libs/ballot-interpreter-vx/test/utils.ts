import { assert } from '@votingworks/basics';

export function randomInt(
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  assert(min <= max);
  return (min + Math.random() * (max - min + 1)) | 0;
}
