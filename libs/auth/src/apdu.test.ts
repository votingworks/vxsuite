import { Buffer } from 'buffer';
import { Byte } from '@votingworks/types';

import { numericArray } from '../test/utils';
import {
  CardCommand,
  CommandApdu,
  constructTlv,
  parseTlv,
  ResponseApduError,
} from './apdu';

test.each<{
  cla?: { chained?: boolean; secure?: boolean };
  expectedFirstByte: Byte;
}>([
  { cla: undefined, expectedFirstByte: 0x00 },
  { cla: {}, expectedFirstByte: 0x00 },
  { cla: { chained: true }, expectedFirstByte: 0x10 },
  { cla: { secure: true }, expectedFirstByte: 0x0c },
  { cla: { chained: true, secure: true }, expectedFirstByte: 0x1c },
])('CommandApdu CLA handling, $cla', ({ cla, expectedFirstByte }) => {
  const apdu = new CommandApdu({
    cla,
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
  });
  expect(apdu.asBuffer()).toEqual(
    Buffer.from([expectedFirstByte, 0x01, 0x02, 0x03, 0x00])
  );
});

test('CommandApdu with data', () => {
  const apdu = new CommandApdu({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.from([0x04, 0x05]),
  });
  expect(apdu.asBuffer()).toEqual(
    Buffer.from([0x00, 0x01, 0x02, 0x03, 0x02, 0x04, 0x05])
  );
});

test('CommandApdu data length validation', () => {
  expect(
    () =>
      new CommandApdu({
        ins: 0x01,
        p1: 0x02,
        p2: 0x03,
        data: Buffer.from(numericArray({ length: 256 })),
      })
  ).toThrow('APDU data exceeds max command APDU data length');
});

test('CommandApdu as hex string', () => {
  const apdu = new CommandApdu({
    ins: 0xa1,
    p1: 0xb2,
    p2: 0xc3,
    data: Buffer.from([0xd4, 0xe5]),
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
    Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]),
  ]);
});

test('CardCommand with data requiring a single APDU', () => {
  const command = new CardCommand({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.from(numericArray({ length: 255 })),
  });
  expect(command.asCommandApdus().map((apdu) => apdu.asBuffer())).toEqual([
    Buffer.from([
      0x00,
      0x01,
      0x02,
      0x03,
      0xff,
      ...numericArray({ length: 255 }),
    ]),
  ]);
});

test('CardCommand with data requiring multiple APDUs', () => {
  const command = new CardCommand({
    ins: 0x01,
    p1: 0x02,
    p2: 0x03,
    data: Buffer.from([
      ...numericArray({ length: 200, value: 1 }),
      ...numericArray({ length: 200, value: 2 }),
      ...numericArray({ length: 200, value: 3 }),
    ]),
  });
  expect(command.asCommandApdus().map((apdu) => apdu.asBuffer())).toEqual([
    Buffer.from([
      0x10,
      0x01,
      0x02,
      0x03,
      0xff,
      ...numericArray({ length: 200, value: 1 }),
      ...numericArray({ length: 55, value: 2 }),
    ]),
    Buffer.from([
      0x10,
      0x01,
      0x02,
      0x03,
      0xff,
      ...numericArray({ length: 145, value: 2 }),
      ...numericArray({ length: 110, value: 3 }),
    ]),
    Buffer.from([
      0x00,
      0x01,
      0x02,
      0x03,
      0x5a, // 90 (600 - 255 - 255) in hex
      ...numericArray({ length: 90, value: 3 }),
    ]),
  ]);
});

test('constructTlv with Byte tag', () => {
  const tlv = constructTlv(0x01, Buffer.from([0x02, 0x03]));
  expect(tlv).toEqual(Buffer.from([0x01, 0x02, 0x02, 0x03]));
});

test('constructTlv with Buffer tag', () => {
  const tlv = constructTlv(
    Buffer.from([0x01, 0x02]),
    Buffer.from([0x03, 0x04])
  );
  expect(tlv).toEqual(Buffer.from([0x01, 0x02, 0x02, 0x03, 0x04]));
});

test.each<{ valueLength: number; expectedTlvLength: Byte[] }>([
  { valueLength: 51, expectedTlvLength: [0x33] },
  { valueLength: 127, expectedTlvLength: [0x7f] },
  { valueLength: 147, expectedTlvLength: [0x81, 0x93] },
  { valueLength: 255, expectedTlvLength: [0x81, 0xff] },
  { valueLength: 3017, expectedTlvLength: [0x82, 0x0b, 0xc9] },
  { valueLength: 65535, expectedTlvLength: [0x82, 0xff, 0xff] },
])(
  'constructTlv value length handling ($valueLength)',
  ({ valueLength, expectedTlvLength }) => {
    const value = numericArray({ length: valueLength });
    const tlv = constructTlv(0x01, Buffer.from(value));
    expect(tlv).toEqual(Buffer.from([0x01, ...expectedTlvLength, ...value]));
  }
);

test('constructTlv value length validation', () => {
  expect(() =>
    constructTlv(0x01, Buffer.from(numericArray({ length: 65536 })))
  ).toThrow('TLV value is too large');
});

test.each<{
  tagAsByteOrBuffer: Byte | Buffer;
  tlv: Buffer;
  expectedOutput: [Buffer, Buffer, Buffer];
}>([
  {
    tagAsByteOrBuffer: 0x01,
    tlv: Buffer.from([0x01, 0x7f, ...numericArray({ length: 127 })]),
    expectedOutput: [
      Buffer.from([0x01]),
      Buffer.from([0x7f]),
      Buffer.from(numericArray({ length: 127 })),
    ],
  },
  {
    tagAsByteOrBuffer: 0x01,
    tlv: Buffer.from([0x01, 0x81, 0xff, ...numericArray({ length: 255 })]),
    expectedOutput: [
      Buffer.from([0x01]),
      Buffer.from([0x81, 0xff]),
      Buffer.from(numericArray({ length: 255 })),
    ],
  },
  {
    tagAsByteOrBuffer: 0x01,
    tlv: Buffer.from([
      0x01,
      0x82,
      0xff,
      0xff,
      ...numericArray({ length: 65535 }),
    ]),
    expectedOutput: [
      Buffer.from([0x01]),
      Buffer.from([0x82, 0xff, 0xff]),
      Buffer.from(numericArray({ length: 65535 })),
    ],
  },
  {
    tagAsByteOrBuffer: Buffer.from([0x01, 0x02]),
    tlv: Buffer.from([0x01, 0x02, 0x01, 0x00]),
    expectedOutput: [
      Buffer.from([0x01, 0x02]),
      Buffer.from([0x01]),
      Buffer.from([0x00]),
    ],
  },
])('parseTlv', ({ tagAsByteOrBuffer, tlv, expectedOutput }) => {
  expect(parseTlv(tagAsByteOrBuffer, tlv)).toEqual(expectedOutput);
});

test('ResponseApduError', () => {
  const error = new ResponseApduError([0x6a, 0x82]);
  expect(error.message).toEqual(
    'Received response APDU with non-success status word: 6a 82'
  );
  expect(error.statusWord()).toEqual([0x6a, 0x82]);
  expect(error.hasStatusWord([0x6a, 0x82])).toEqual(true);
  expect(error.hasStatusWord([0x6b, 0x82])).toEqual(false);
  expect(error.hasStatusWord([0x6a, 0x83])).toEqual(false);
});
