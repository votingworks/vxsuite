import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import fc from 'fast-check';
import { asHexString, Byte } from '@votingworks/types';

import {
  CardCommand,
  ClaParams,
  CommandApdu,
  constructTlv,
  parseTlv,
  ResponseApduError,
  Tlv,
} from './apdu';

test.each<{
  cla?: ClaParams;
  expectedFirstByte: Byte;
}>([
  { cla: undefined, expectedFirstByte: 0x00 },
  { cla: {}, expectedFirstByte: 0x00 },
  { cla: { chained: true }, expectedFirstByte: 0x10 },
  { cla: { secureMessaging: true }, expectedFirstByte: 0x04 },
  { cla: { chained: true, secureMessaging: true }, expectedFirstByte: 0x14 },
])('CommandApdu CLA handling - $cla', ({ cla, expectedFirstByte }) => {
  const apdu = new CommandApdu({
    cla,
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.of(),
  });
  expect(apdu.asBuffer()).toEqual(
    Buffer.of(expectedFirstByte, 0x01, 0x02, 0x03, 0x00)
  );
});

test('CommandApdu with data', () => {
  const apdu = new CommandApdu({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.of(0x04, 0x05),
  });
  expect(apdu.asBuffer()).toEqual(
    Buffer.of(0x00, 0x01, 0x02, 0x03, 0x02, 0x04, 0x05)
  );
});

test('CommandApdu data length validation', () => {
  expect(
    () =>
      new CommandApdu({
        ins: 0x01,
        p1: 0x02,
        p2: 0x03,
        data: Buffer.alloc(256),
      })
  ).toThrow('APDU data exceeds max command APDU data length');
});

test('CommandApdu as hex string', () => {
  const apdu = new CommandApdu({
    ins: 0xa1,
    p1: 0xb2,
    p2: 0xc3,
    data: Buffer.of(0xd4, 0xe5),
  });
  expect(apdu.asHexString()).toEqual('00a1b2c302d4e5');
  expect(apdu.asHexString(':')).toEqual('00:a1:b2:c3:02:d4:e5');
});

test('CardCommand with no data', () => {
  const command = new CardCommand({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
  });
  expect(command.asCommandApdus().map((apdu) => apdu.asBuffer())).toEqual([
    Buffer.of(0x00, 0x01, 0x02, 0x03, 0x00),
  ]);
});

test('CardCommand with data requiring a single APDU', () => {
  const command = new CardCommand({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.alloc(255),
  });
  expect(command.asCommandApdus().map((apdu) => apdu.asBuffer())).toEqual([
    Buffer.concat([Buffer.of(0x00, 0x01, 0x02, 0x03, 0xff), Buffer.alloc(255)]),
  ]);
});

test('CardCommand with data requiring multiple APDUs', () => {
  const command = new CardCommand({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.concat([
      Buffer.alloc(200, 1),
      Buffer.alloc(200, 2),
      Buffer.alloc(200, 3),
    ]),
  });
  expect(command.asCommandApdus().map((apdu) => apdu.asBuffer())).toEqual([
    Buffer.concat([
      Buffer.of(0x10, 0x01, 0x02, 0x03, 0xff),
      Buffer.alloc(200, 1),
      Buffer.alloc(55, 2),
    ]),
    Buffer.concat([
      Buffer.of(0x10, 0x01, 0x02, 0x03, 0xff),
      Buffer.alloc(145, 2),
      Buffer.alloc(110, 3),
    ]),
    Buffer.concat([
      Buffer.of(
        0x00,
        0x01,
        0x02,
        0x03,
        0x5a // 90 (600 - 255 - 255) in hex
      ),
      Buffer.alloc(90, 3),
    ]),
  ]);
});

test('constructTlv with Byte tag', () => {
  const tlv = constructTlv(0x01, Buffer.of(0x02, 0x03));
  expect(tlv).toEqual(Buffer.of(0x01, 0x02, 0x02, 0x03));
});

test('constructTlv with Buffer tag', () => {
  const tlv = constructTlv(Buffer.of(0x01, 0x02), Buffer.of(0x03, 0x04));
  expect(tlv).toEqual(Buffer.of(0x01, 0x02, 0x02, 0x03, 0x04));
});

test.each<{ valueLength: number; expectedTlvLength: Byte[] }>([
  { valueLength: 51, expectedTlvLength: [0x33] },
  { valueLength: 127, expectedTlvLength: [0x7f] },
  { valueLength: 147, expectedTlvLength: [0x81, 0x93] },
  { valueLength: 255, expectedTlvLength: [0x81, 0xff] },
  { valueLength: 3017, expectedTlvLength: [0x82, 0x0b, 0xc9] },
  { valueLength: 65535, expectedTlvLength: [0x82, 0xff, 0xff] },
])(
  'constructTlv value length handling - $valueLength',
  ({ valueLength, expectedTlvLength }) => {
    const value = Buffer.alloc(valueLength);
    const tlv = constructTlv(0x01, value);
    expect(tlv).toEqual(Buffer.of(0x01, ...expectedTlvLength, ...value));
  }
);

test('constructTlv value length validation', () => {
  expect(() => constructTlv(0x01, Buffer.alloc(65536))).toThrow(
    'TLV value length is too large for TLV encoding: 0x10000 > 0xffff'
  );
});

test('parseTlv invalid length', () => {
  expect(() =>
    parseTlv(0x01, Buffer.concat([Buffer.of(0x01, 0xff), Buffer.alloc(0xff)]))
  ).toThrow('TLV length first byte is too large: 0xff > 0x82');
});

test.each<{
  tagAsByteOrBuffer: Byte | Buffer;
  tlv: Buffer;
  expectedOutput: Tlv;
}>([
  {
    tagAsByteOrBuffer: 0x01,
    tlv: Buffer.concat([Buffer.of(0x01, 0x7f), Buffer.alloc(0x7f)]),
    expectedOutput: {
      tag: Buffer.of(0x01),
      length: Buffer.of(0x7f),
      value: Buffer.alloc(0x7f),
    },
  },
  {
    tagAsByteOrBuffer: 0x01,
    tlv: Buffer.concat([Buffer.of(0x01, 0x81, 0xff), Buffer.alloc(0xff)]),
    expectedOutput: {
      tag: Buffer.of(0x01),
      length: Buffer.of(0x81, 0xff),
      value: Buffer.alloc(0xff),
    },
  },
  {
    tagAsByteOrBuffer: 0x01,
    tlv: Buffer.concat([
      Buffer.of(0x01, 0x82, 0xff, 0xff),
      Buffer.alloc(0xffff),
    ]),
    expectedOutput: {
      tag: Buffer.of(0x01),
      length: Buffer.of(0x82, 0xff, 0xff),
      value: Buffer.alloc(0xffff),
    },
  },
  {
    tagAsByteOrBuffer: Buffer.of(0x01, 0x02),
    tlv: Buffer.of(0x01, 0x02, 0x01, 0x00),
    expectedOutput: {
      tag: Buffer.of(0x01, 0x02),
      length: Buffer.of(0x01),
      value: Buffer.of(0x00),
    },
  },
])('parseTlv', ({ tagAsByteOrBuffer, tlv, expectedOutput }) => {
  expect(parseTlv(tagAsByteOrBuffer, tlv)).toEqual<Tlv>(expectedOutput);
});

test('constructTlv/parseTlv round trip', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 0xff }),
      fc.integer({ min: 0, max: 0xffff }),
      (tag, valueLength) => {
        const value = Buffer.alloc(valueLength);
        const tlv = constructTlv(tag as Byte, value);

        const parsedTlv = parseTlv(tag as Byte, tlv);
        expect(parsedTlv).toEqual<Tlv>({
          tag: Buffer.of(tag),
          length: expect.any(Buffer),
          value,
        });

        const wrongTag = ((tag + 1) % 0x100) as Byte;
        expect(() => parseTlv(wrongTag, tlv)).toThrow(
          `TLV tag (<Buffer ${asHexString(tag as Byte)}>) ` +
            `does not match expected tag (<Buffer ${asHexString(wrongTag)}>)`
        );
      }
    )
  );
});

test('ResponseApduError', () => {
  const error = new ResponseApduError([0x6a, 0x82]);
  expect(error.message).toEqual(
    'Received response APDU with error status word: 6a 82'
  );
  expect(error.statusWord()).toEqual([0x6a, 0x82]);
  expect(error.hasStatusWord([0x6a, 0x82])).toEqual(true);
  expect(error.hasStatusWord([0x6b, 0x82])).toEqual(false);
  expect(error.hasStatusWord([0x6a, 0x83])).toEqual(false);
});
