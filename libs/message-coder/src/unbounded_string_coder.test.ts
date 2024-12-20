import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { literal } from './literal_coder';
import { message } from './message_coder';
import { unboundedString } from './unbounded_string_coder';

test('unbounded string', () => {
  const coder = unboundedString();
  expect(coder.canEncode('')).toEqual(true);
  expect(coder.canEncode('hello')).toEqual(true);
  expect(coder.canEncode(undefined)).toEqual(false);
  expect(coder.default()).toEqual('');
  expect(coder.bitLength('hello')).toEqual(ok(5 * 8));
  expect(coder.encode('hello')).toEqual(ok(Buffer.from('hello')));
  expect(coder.decode(Buffer.from('hello'))).toEqual(ok('hello'));
});

test('unbounded string inside a message', () => {
  const m = message({ header: literal('CDAT'), data: unboundedString() });
  expect(m.default()).toEqual({ header: ['CDAT'], data: '' });
  expect(m.bitLength({ data: 'hello' })).toEqual(ok(32 + 5 * 8));
  expect(m.encode({ data: 'hello' })).toEqual(ok(Buffer.from('CDAThello')));
  expect(m.decode(Buffer.from('CDAThello'))).toEqual(ok({ data: 'hello' }));
});

test('unbounded string with too small buffer', () => {
  const coder = unboundedString();
  expect(coder.encodeInto('hello', Buffer.alloc(4), 0)).toEqual(
    err('SmallBuffer')
  );
  expect(coder.decodeFrom(Buffer.alloc(4), 40)).toEqual(err('SmallBuffer'));
});
