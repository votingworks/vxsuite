import { sha256 } from 'js-sha256';

/**
 * Generates an ID from the given text.
 */
export function makeId(printable: string, extra = ''): string {
  const hash = sha256(printable + extra);
  return `${printable.replace(/[^-_a-z\d+]+/gi, '-').slice(0, 64)}-${hash.slice(
    0,
    8
  )}`;
}
