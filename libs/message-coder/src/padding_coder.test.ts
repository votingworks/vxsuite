import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { message } from './message_coder';
import { padding } from './padding_coder';
import { uint4 } from './uint4_coder';
import { uint8 } from './uint8_coder';

test('padding', () => {
  const m = message({
    a: uint4(),
    padding: padding(4),
    b: uint8(),
  });

  expect(padding(1).canEncode(undefined)).toEqual(true);
  expect(padding(1).canEncode('a value')).toEqual(false);

  expect(m.default()).toEqual({ a: 0, b: 0 });
  expect(m.bitLength({ a: 1, b: 2 })).toEqual(ok(16));
  expect(m.encode({ a: 1, b: 2 })).toEqual(ok(Buffer.from([0b00010000, 0x02])));
  expect(m.decode(Buffer.from([0b00010000, 0x02]))).toEqual(ok({ a: 1, b: 2 }));

  // padding bits are ignored
  expect(m.decode(Buffer.from([0b00010110, 0x02]))).toEqual(ok({ a: 1, b: 2 }));
});

test('padding with too small buffer', () => {
  const m = message({
    padding: padding(16),
  });

  expect(m.default()).toEqual({});
  expect(m.encodeInto({}, Buffer.alloc(1), 0)).toEqual(err('SmallBuffer'));
  expect(m.decodeFrom(Buffer.alloc(1), 0)).toEqual(err('SmallBuffer'));
});

test('padding has no default', () => {
  expect(padding(1).default()).toBeUndefined();
});
