import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import fc from 'fast-check';
import { literal } from './literal_coder';
import { message } from './message_coder';
import { oneOf } from './one_of_coder';
import { uint16 } from './uint16_coder';
import { uint8 } from './uint8_coder';

test('oneOf one message', () => {
  const a = oneOf(
    message({
      type: literal('A'),
      aValue: uint16(),
    })
  );

  expect(a.canEncode({ aValue: 1 })).toEqual(true);
  expect(a.canEncode({ bValue: 1 })).toEqual(false);

  expect(a.bitLength({ aValue: 1 })).toEqual(ok(8 + 16));
  // @ts-expect-error - intentionally incompatible to test an error case
  expect(a.bitLength({ bValue: 1 })).toEqual(err('InvalidValue'));

  // uses the default of the first coder
  expect(a.default()).toEqual({ type: ['A'], aValue: 0 });

  expect(a.encode({ aValue: 1 })).toEqual(
    ok(Buffer.of('A'.charCodeAt(0), 0x01, 0x00))
  );
  expect(a.decode(Buffer.from(['A'.charCodeAt(0), 0x01, 0x00]))).toEqual(
    ok({ aValue: 1 })
  );
});

test('oneOf two messages', () => {
  const aOrB = oneOf(
    message({
      type: literal('A'),
      aValue: uint16(),
    }),
    message({
      type: literal('B'),
      bValue: uint8(),
    })
  );

  expect(aOrB.canEncode({ aValue: 1 })).toEqual(true);
  expect(aOrB.canEncode({ bValue: 1 })).toEqual(true);
  expect(aOrB.canEncode({ cValue: 1 })).toEqual(false);

  expect(aOrB.bitLength({ aValue: 1 })).toEqual(ok(8 + 16));
  expect(aOrB.bitLength({ bValue: 1 })).toEqual(ok(8 + 8));
  // @ts-expect-error - intentionally incompatible to test an error case
  expect(aOrB.bitLength({ cValue: 1 })).toEqual(err('InvalidValue'));

  // uses the default of the first coder
  expect(aOrB.default()).toEqual({ type: ['A'], aValue: 0 });

  expect(aOrB.encode({ aValue: 1 })).toEqual(
    ok(Buffer.of('A'.charCodeAt(0), 0b00000001, 0b00000000))
  );
  expect(aOrB.encode({ bValue: 1 })).toEqual(
    ok(Buffer.of('B'.charCodeAt(0), 0b00000001))
  );
  // @ts-expect-error - intentionally incompatible to test an error case
  expect(aOrB.encode({ cValue: 1 })).toEqual(err('InvalidValue'));

  // @ts-expect-error - intentionally incompatible to test an error case
  expect(aOrB.encodeInto({ cValue: 1 }, Buffer.alloc(3), 0)).toEqual(
    err('InvalidValue')
  );

  expect(aOrB.decode(Buffer.from([]))).toEqual(err('InvalidValue'));

  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0xffff }), (aValue) => {
      const encoded = aOrB.encode({ aValue }).unsafeUnwrap();
      expect(encoded).toEqual(
        Buffer.of('A'.charCodeAt(0), aValue & 0xff, aValue >> 8)
      );
      const decoded = aOrB.decode(encoded).unsafeUnwrap();
      expect(decoded).toEqual({ aValue });
    })
  );

  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0xff }), (bValue) => {
      const encoded = aOrB.encode({ bValue }).unsafeUnwrap();
      expect(encoded).toEqual(Buffer.of('B'.charCodeAt(0), bValue));
      const decoded = aOrB.decode(encoded).unsafeUnwrap();
      expect(decoded).toEqual({ bValue });
    })
  );
});

test('oneOf by discriminator', () => {
  const HorizontalSettings = message({
    type: literal('horizontal'),
    resolution: uint16(),
  });
  const VerticalSettings = message({
    type: literal('vertical'),
    resolution: uint16(),
  });

  const Settings = oneOf(HorizontalSettings, VerticalSettings);

  // implicitly uses `HorizontalSettings` since it's first and both match
  expect(Settings.encode({ resolution: 1024 }).unsafeUnwrap()).toEqual(
    Buffer.concat([Buffer.from('horizontal'), Buffer.from([0x00, 0x04])])
  );

  // explicitly uses `VerticalSettings` because `type` is provided
  expect(
    Settings.encode({ type: 'vertical', resolution: 768 }).unsafeUnwrap()
  ).toEqual(
    Buffer.concat([Buffer.from('vertical'), Buffer.from([0x00, 0x03])])
  );

  // explicitly uses `HorizontalSettings` because `type` is provided
  expect(
    Settings.encode({ type: 'horizontal', resolution: 1024 }).unsafeUnwrap()
  ).toEqual(
    Buffer.concat([Buffer.from('horizontal'), Buffer.from([0x00, 0x04])])
  );
});
