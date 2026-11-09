import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  FRAME_HEADER_LENGTH,
  FrameType,
  MAX_FRAME_PAYLOAD,
  ProtocolError,
  Reader,
  Writer,
  decodeEvent,
  decodeFrameHeader,
  decodeImage,
  decodeResponse,
  encodeFrame,
} from './protocol.js';

test('primitives round-trip through the reader', () => {
  const payload = new Writer()
    .u8(0xff)
    .bool(true)
    .bool(false)
    .u16(0xbeef)
    .u32(0xdead_beef)
    .i32(-2_000_000_000)
    .i64(-9_007_199_254_740_991)
    .str('…unicode ✓')
    .bytes(Buffer.of(1, 2, 3))
    .finish();

  const r = new Reader(payload);
  expect(r.u8()).toEqual(0xff);
  expect(r.bool()).toEqual(true);
  expect(r.bool()).toEqual(false);
  expect(r.u16()).toEqual(0xbeef);
  expect(r.u32()).toEqual(0xdead_beef);
  expect(r.i32()).toEqual(-2_000_000_000);
  expect(r.i64()).toEqual(-9_007_199_254_740_991);
  expect(r.str()).toEqual('…unicode ✓');
  expect(r.bytes()).toEqual(Buffer.of(1, 2, 3));
  expect(() => r.finish()).not.toThrow();
});

test('an int64 too large for a number is rejected rather than silently rounded', () => {
  // 2^62, written by hand so the test file needs no BigInt literals.
  const payload = Buffer.of(0, 0, 0, 0, 0, 0, 0, 0x40);
  expect(() => new Reader(payload).i64()).toThrow(/does not fit in a number/);
  expect(() => new Writer().i64(2 ** 62)).toThrow(/not a safe integer/);
});

test('reading past the end of a payload throws rather than returning garbage', () => {
  const r = new Reader(Buffer.of(1, 2));
  expect(() => r.u32()).toThrow(ProtocolError);
});

test('trailing data is an error', () => {
  const r = new Reader(Buffer.of(1, 2));
  r.u8();
  expect(() => r.finish()).toThrow(/trailing data/);
});

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

test('an unknown error code is a protocol error', () => {
  const payload = new Writer().u32(1).u8(1).u16(99).str('').finish();
  expect(() => decodeResponse(payload)).toThrow(/unknown error code/);
});

test('an unknown response discriminant is a protocol error', () => {
  expect(() => decodeResponse(new Writer().u32(1).u8(200).finish())).toThrow(
    /unknown response discriminant 200/
  );
});

test('an unknown event discriminant is a protocol error', () => {
  expect(() => decodeEvent(Buffer.of(200))).toThrow(
    /unknown event discriminant 200/
  );
});

test('decodes an image without copying the pixels', () => {
  const pixels = Buffer.alloc(10_000, 0xab);
  const payload = new Writer()
    .i64(42)
    .i32(0)
    .i32(1)
    .i32(200)
    .i32(1_700)
    .i32(2_200)
    .i32(1_700)
    .i32(8)
    .i32(2)
    .i32(0)
    .i32(0)
    .i32(0)
    .i32(0)
    .i64(1)
    .i64(2)
    .i64(3)
    .i64(4)
    .str('batch7_0042')
    .str('')
    .bytes(pixels)
    .finish();

  const image = decodeImage(payload);
  expect(image.header).toEqual({
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
    counters: [1, 2, 3, 4],
    endorserFrontText: 'batch7_0042',
    endorserBackText: '',
  });
  expect(image.data).toEqual(pixels);
  // The pixels are a window onto the frame, not a copy of it.
  expect(image.data.buffer).toEqual(payload.buffer);
});
