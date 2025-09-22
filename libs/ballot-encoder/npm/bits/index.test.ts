import { expect, test } from 'vitest';
import { BitReader, JsBitWriter } from '.';

test('can round-trip a bit', () => {
  expect(
    new BitReader(new JsBitWriter().writeUint1(1).toUint8Array()).readUint1()
  ).toEqual(1);
});

test('can round-trip a byte', () => {
  expect(
    new BitReader(new JsBitWriter().writeUint8(127).toUint8Array()).readUint8()
  ).toEqual(127);
});

test('can round-trip a utf-8 string', () => {
  expect(
    new BitReader(
      new JsBitWriter().writeUtf8String('abcdé', { writeLength: true, maxLength: 255 }).toUint8Array()
    ).readUtf8String({ readLength: true, maxLength: 255 })
  ).toEqual('abcdé');
});

test('can round-trip a utf-8 emoji string', () => {
  expect(
    new BitReader(
      new JsBitWriter().writeUtf8String('✓ 😊', { writeLength: true, maxLength: 255 }).toUint8Array()
    ).readUtf8String({ readLength: true, maxLength: 255 })
  ).toEqual('✓ 😊');
});

test('can round-trip a non-aligned utf-8 emoji string', () => {
  const reader = new BitReader(
    new JsBitWriter().writeUint1(0).writeUtf8String('🌈', { writeLength: true, maxLength: 255 }).toUint8Array()
  );

  expect(reader.readUint1()).toEqual(0);
  expect(reader.readUtf8String({ readLength: true, maxLength: 255 })).toEqual('🌈');
});

test('can round-trip a string with a custom maximum length', () => {
  expect(
    new BitReader(
      new JsBitWriter().writeUtf8String('a', { writeLength: true, maxLength: 2 }).toUint8Array()
    ).readUtf8String({ readLength: true, maxLength: 2 })
  ).toEqual('a');
});
