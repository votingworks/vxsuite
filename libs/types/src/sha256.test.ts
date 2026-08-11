import { expect, test } from 'vitest';
import fc from 'fast-check';
import { createHash } from 'node:crypto';
import { sha256 } from './sha256';

test('hashes strings as UTF-8', () => {
  // NIST test vector
  expect(sha256('abc')).toEqual(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  expect(sha256('')).toEqual(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  expect(sha256('¡Hola!')).toEqual(
    'ffb948556a252fec4aa0601da677fda38bb2ab0be63cc9c726bebfd1b3500d62'
  );
});

test('hashes bytes', () => {
  expect(sha256(new TextEncoder().encode('abc'))).toEqual(sha256('abc'));
});

test('hashes to the same digest as node:crypto', () => {
  fc.assert(
    fc.property(fc.string(), (value) => {
      expect(sha256(value)).toEqual(
        createHash('sha256').update(value).digest('hex')
      );
    })
  );
});
