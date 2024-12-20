import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import * as fc from 'fast-check';
import {
  bufferContainsBitOffset,
  toBitLength,
  toBitOffset,
  toByteLength,
  toByteOffset,
} from './bits';

test('toByteLength', () => {
  expect(toByteLength(0)).toEqual(0);
  expect(toByteLength(1)).toEqual(1);
  expect(toByteLength(4)).toEqual(1);
  expect(toByteLength(7)).toEqual(1);
  expect(toByteLength(8)).toEqual(1);
  expect(toByteLength(9)).toEqual(2);

  fc.assert(
    fc.property(fc.integer(0, 0xffff), (value) => {
      expect(toByteLength(value)).toEqual(Math.ceil(value / 8));
    })
  );
});

test('toBitLength', () => {
  expect(toBitLength(0)).toEqual(0);
  expect(toBitLength(1)).toEqual(8);

  fc.assert(
    fc.property(fc.integer(0, 0xffff), (value) => {
      expect(toBitLength(value)).toEqual(value * 8);
    })
  );
});

test('toByteOffset', () => {
  expect(toByteOffset(0)).toEqual(ok(0));
  expect(toByteOffset(1)).toEqual(err('UnsupportedOffset'));
  expect(toByteOffset(7)).toEqual(err('UnsupportedOffset'));
  expect(toByteOffset(8)).toEqual(ok(1));
});

test('toBitOffset', () => {
  expect(toBitOffset(0)).toEqual(0);
  expect(toBitOffset(1)).toEqual(8);
  expect(toBitOffset(7)).toEqual(56);
  expect(toBitOffset(8)).toEqual(64);
});

test('toBitOffset/toByteOffset round-trip', () => {
  fc.assert(
    fc.property(fc.integer(0, 0xffff), (value) => {
      expect(toByteOffset(toBitOffset(value)).unsafeUnwrap()).toEqual(value);
    })
  );
});

test('toBitLength/toByteLength round-trip', () => {
  fc.assert(
    fc.property(fc.integer(0, 0xffff), (value) => {
      expect(toByteLength(toBitLength(value))).toEqual(value);
    })
  );
});

test('bufferContainsBitOffset', () => {
  expect(bufferContainsBitOffset(Buffer.alloc(0), 0)).toEqual(true);
  expect(bufferContainsBitOffset(Buffer.alloc(0), 0, 0)).toEqual(true);
  expect(bufferContainsBitOffset(Buffer.alloc(0), 0, 1)).toEqual(false);
  expect(bufferContainsBitOffset(Buffer.alloc(0), 1)).toEqual(false);
  expect(bufferContainsBitOffset(Buffer.alloc(1), 7, 1)).toEqual(true);
  expect(bufferContainsBitOffset(Buffer.alloc(1), 7, 2)).toEqual(false);
});
