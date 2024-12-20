import { expect, test } from 'vitest';
import { err, ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { fixedString } from './fixed_string';
import { literal } from './literal_coder';
import { CoderType, message } from './message_coder';
import { DecodeResult } from './types';
import { uint8 } from './uint8_coder';
import { padding } from './padding_coder';

test('empty message', () => {
  const m = message({});
  type m = CoderType<typeof m>;

  expect(m.canEncode(null)).toEqual(false);
  expect(m.canEncode(undefined)).toEqual(false);
  expect(m.canEncode({})).toEqual(true);
  expect(m.default()).toEqual({});
  expect(m.bitLength({})).toEqual(ok(0));
  expect(m.encode({})).toEqual(ok(Buffer.alloc(0)));
  expect(m.decode(Buffer.alloc(0))).toEqual<m>(ok({}));

  const buffer = Buffer.alloc(100);
  expect(m.encodeInto({}, buffer, 0)).toEqual(ok(0));
  expect(m.decodeFrom(buffer, 0)).toEqual<DecodeResult<m>>(
    ok({ value: {}, bitOffset: 0 })
  );
});

test('message with single literal', () => {
  const m = message({ header: literal('PDF') });
  type m = CoderType<typeof m>;

  expect(m.canEncode({})).toEqual(true);
  expect(m.default()).toEqual({ header: ['PDF'] });
  expect(m.bitLength({})).toEqual(ok(24));
  expect(m.encode({ header: 'PDF' })).toEqual(ok(Buffer.from('PDF')));
  expect(m.decode(Buffer.from('PDF'))).toEqual(ok(typedAs<m>({})));
  expect(m.decode(Buffer.from('DFP'))).toEqual(err('InvalidValue'));
});

test('message with single uint8', () => {
  const m = message({ version: uint8() });
  expect(m.canEncode({ version: 1 })).toEqual(true);
  expect(m.canEncode({})).toEqual(false);
  expect(m.default()).toEqual({ version: 0 });
  expect(m.bitLength({ version: 1 })).toEqual(ok(8));
  expect(m.encode({ version: 1 })).toEqual(ok(Buffer.from([1])));
  expect(m.decode(Buffer.from([1]))).toEqual(ok({ version: 1 }));
});

test('message with multiple fields', () => {
  const m = message({
    header: literal('PDF'),
    version: uint8(),
    flags: uint8(),
  });
  expect(m.default()).toEqual({ header: ['PDF'], version: 0, flags: 0 });
  expect(m.bitLength({ version: 1, flags: 2 })).toEqual(ok(40));
  expect(m.encode({ version: 1, flags: 2 })).toEqual(
    // 0x01 = version, 0x02 = flags
    ok(Buffer.from('PDF\x01\x02'))
  );
  // 0x01 = version, 0x02 = flags
  expect(m.decode(Buffer.from('PDF\x01\x02'))).toEqual(
    ok({ version: 1, flags: 2 })
  );
});

test('message with padding', () => {
  const m = message({
    field1: uint8(),
    field2: padding(16),
    field3: uint8(),
  });
  expect(m.canEncode({ field1: 1, field3: 2 })).toEqual(true);
  expect(m.canEncode({})).toEqual(false);
  // include `field2` for code coverage purposes
  expect(m.canEncode({ field1: 1, field2: undefined, field3: 2 })).toEqual(
    true
  );
  expect(m.default()).toEqual({ field1: 0, field3: 0 });
  expect(m.bitLength({ field1: 1, field3: 2 })).toEqual(ok(8 + 16 + 8));
  expect(m.encode({ field1: 1, field3: 2 })).toEqual(
    // 0x01 = field1, 0x00 0x00 = padding, 0x02 = field3
    ok(Buffer.from([0x01, 0x00, 0x00, 0x02]))
  );
  // 0x01 = field1, 0x00 0x00 = padding, 0x02 = field3
  expect(m.decode(Buffer.from([0x01, 0x00, 0x00, 0x02]))).toEqual(
    ok({ field1: 1, field3: 2 })
  );
});

test('id3v1 tag', () => {
  enum Genre {
    Blues = 0x00,
    ClassicRock = 0x01,
    Country = 0x02,
    Dance = 0x03,
    Disco = 0x04,
    Funk = 0x05,
    Grunge = 0x06,
    HipHop = 0x07,
    Jazz = 0x08,
    // ...
  }

  // define a coder for ID3v1 tags
  const id3v1 = message({
    header: literal('TAG'),
    title: fixedString(30),
    artist: fixedString(30),
    album: fixedString(30),
    year: fixedString(4),
    comment: fixedString(28),
    zeroByte: literal(0x00),
    track: uint8(),
    genre: uint8<Genre>(Genre),
  });
  type id3v1 = CoderType<typeof id3v1>;

  // encode a tag
  const tag: id3v1 = {
    title: 'The Title',
    artist: 'The Artist',
    album: 'The Album',
    year: '2000',
    comment: 'The Comment',
    track: 1,
    genre: 2,
  };

  const encodeResult = id3v1.encode(tag);
  const decodeResult = id3v1.decode(encodeResult.assertOk('encode failed'));
  expect(decodeResult).toEqual(ok(tag));
  expect(id3v1.default()).toEqual({
    header: ['TAG'],
    title: '',
    artist: '',
    album: '',
    year: '',
    comment: '',
    zeroByte: [0],
    track: 0,
    genre: 0,
  });
});
