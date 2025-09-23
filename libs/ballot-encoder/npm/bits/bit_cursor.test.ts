import { expect, test } from 'vitest';
import { BitCursor } from './bit_cursor';

test('starts with bit offset 0', () => {
  expect(new BitCursor().bitOffset).toEqual(0);
});

test('starts with byte offset 0', () => {
  expect(new BitCursor().byteOffset).toEqual(0);
});

test('starts at a byte start offset', () => {
  expect(new BitCursor().isByteStart).toEqual(true);
});

test('can go to the next bit', () => {
  expect(new BitCursor().next().bitOffset).toEqual(1);
  expect(new BitCursor().next().byteOffset).toEqual(0);
});

test('can go to the previous bit', () => {
  expect(new BitCursor().prev().bitOffset).toEqual(7);
  expect(new BitCursor().prev().byteOffset).toEqual(-1);
});

test('can get a mask for the current bit offset position', () => {
  const cursor = new BitCursor();
  expect(cursor.mask()).toEqual(0b10000000);
  expect(cursor.next().mask()).toEqual(0b01000000);
  expect(cursor.next().mask()).toEqual(0b00100000);
  expect(cursor.next().mask()).toEqual(0b00010000);
  expect(cursor.next().mask()).toEqual(0b00001000);
  expect(cursor.next().mask()).toEqual(0b00000100);
  expect(cursor.next().mask()).toEqual(0b00000010);
  expect(cursor.next().mask()).toEqual(0b00000001);
  expect(cursor.next().mask()).toEqual(0b10000000);
});

test('always returns 0 for an unset mask', () => {
  const cursor = new BitCursor();
  expect(cursor.mask(0)).toEqual(0);
  expect(cursor.next().mask(0)).toEqual(0);
});
