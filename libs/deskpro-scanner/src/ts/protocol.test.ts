import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  type DaemonEvent,
  FRAME_HEADER_LENGTH,
  FrameType,
  MAX_FRAME_PAYLOAD,
  ProtocolError,
  decodeCommand,
  decodeEvent,
  decodeFrameHeader,
  decodeImage,
  decodeResponse,
  encodeCommand,
  encodeEvent,
  encodeFrame,
  encodeImage,
} from './protocol.js';

test('frames round-trip', () => {
  const payload = Buffer.from('payload');
  const frame = encodeFrame(FrameType.Event, payload);
  expect(decodeFrameHeader(frame)).toEqual({
    frameType: FrameType.Event,
    length: payload.length,
  });
  expect(frame.subarray(FRAME_HEADER_LENGTH)).toEqual(payload);
});

test('an oversized frame is refused before it is allocated', () => {
  const header = Buffer.alloc(FRAME_HEADER_LENGTH);
  header.writeUInt8(FrameType.Image, 0);
  header.writeUInt32LE(MAX_FRAME_PAYLOAD + 1, 1);
  expect(() => decodeFrameHeader(header)).toThrow(/exceeds/);
});

test('commands wider than 32 bits are sent as integers', () => {
  for (const value of [-9_007_199_254_740_991, -9_000_000_000, -1, 5]) {
    const payload = encodeCommand(1, { kind: 'setCounter', index: 1, value });
    expect(decodeCommand(payload).body).toEqual({
      kind: 'setCounter',
      index: 1,
      value,
    });
  }
});

test('a command with an out-of-range field is refused before it is sent', () => {
  expect(() =>
    encodeCommand(1, { kind: 'setCounter', index: 1, value: 2 ** 62 })
  ).toThrow(ProtocolError);
  expect(() =>
    encodeCommand(1, { kind: 'setNumberOfSheets', count: -1 })
  ).toThrow(ProtocolError);
  expect(() =>
    encodeCommand(1, { kind: 'setCounter', index: 256, value: 0 })
  ).toThrow(ProtocolError);
});

test('a payload that is not CBOR is a protocol error', () => {
  expect(() => decodeEvent(Buffer.of(0xff))).toThrow(/invalid CBOR/);
});

test('trailing data is a protocol error', () => {
  const payload = Buffer.concat([
    encodeEvent({ kind: 'log', message: 'x' }),
    Buffer.of(0),
  ]);
  expect(() => decodeEvent(payload)).toThrow(/invalid CBOR/);
});

test('a message of the wrong shape is a protocol error', () => {
  const unknownKind: unknown = { kind: 'selfDestruct' };
  expect(() => decodeEvent(encodeEvent(unknownKind as DaemonEvent))).toThrow(
    ProtocolError
  );
  expect(() =>
    decodeResponse(encodeEvent({ kind: 'operationalState', state: 0 }))
  ).toThrow(ProtocolError);
});

test('an int64 too large for a number is rejected rather than silently rounded', () => {
  const payload = encodeEvent({
    kind: 'oversizedImage',
    seqId: 1,
    scanSide: 0,
    size: (BigInt(2) ** BigInt(62)) as never,
  });
  expect(() => decodeEvent(payload)).toThrow(ProtocolError);
});

const IMAGE_HEADER = {
  seqId: 42,
  streamId: 0,
  scanSide: 1,
  resolution: 200,
  pixelsPerLine: 1_700,
  lines: 2_200,
  bytesPerLine: 1_700,
  bitsPerPixel: 8,
  fileFormat: 2,
  compression: 0,
  doubleFeed: 0,
  blankPage: 0,
  integrity: 0,
  counters: [1, 2, 3, -9_000_000_000],
  endorserFrontText: 'batch7_0042',
} as const;

test('decodes an image without copying the pixels', () => {
  const pixels = Buffer.alloc(10_000, 0xab);
  const payload = encodeImage({ header: IMAGE_HEADER, data: pixels });

  const image = decodeImage(payload);
  expect(image.header).toEqual(IMAGE_HEADER);
  expect(image.data).toEqual(pixels);
  // The pixels are a window onto the frame, not a copy of it.
  expect(image.data.buffer).toEqual(payload.buffer);
});

test('an image with a truncated header is a protocol error', () => {
  const payload = encodeImage({
    header: IMAGE_HEADER,
    data: Buffer.alloc(0),
  });
  expect(() => decodeImage(payload.subarray(0, 3))).toThrow(/no header length/);
  expect(() => decodeImage(payload.subarray(0, 10))).toThrow(
    /image header declared/
  );
});
