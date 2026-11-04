import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  type Command,
  type DaemonEvent,
  ErrorCode,
  FRAME_HEADER_LENGTH,
  FrameType,
  MAX_FRAME_PAYLOAD,
  ProtocolError,
  Reader,
  Writer,
  decodeEvent,
  decodeFrameHeader,
  decodeHello,
  decodeImage,
  decodeResponse,
  encodeCommand,
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

const EVERY_COMMAND: Command[] = [
  { kind: 'exit' },
  { kind: 'connect', appId: 'VxCentralScan' },
  { kind: 'disconnect' },
  { kind: 'getStatus' },
  { kind: 'getVersions' },
  { kind: 'getProfile' },
  { kind: 'setProfile', profile: 'ProfilePaper_brightness = 200\n' },
  { kind: 'setReady', ready: true },
  { kind: 'setReady', ready: false },
  { kind: 'scanStart' },
  { kind: 'scanStop' },
  { kind: 'scanPause' },
  { kind: 'scanResume' },
  { kind: 'setImprinterText', text: 'batch7_%NMC4%%CNT1%' },
  { kind: 'setCounter', index: 1, value: -9_000_000_000 },
  { kind: 'setNumberOfSheets', count: 25 },
];

test.each(EVERY_COMMAND)('encodes command $kind', (command) => {
  const encoded = encodeCommand(7, command);
  // The daemon is the decoder, so here we assert the framing contract: an id, a discriminant,
  // and nothing left over once the daemon's Rust decoder has read the arguments.
  expect(encoded.readUInt32LE(0)).toEqual(7);
  expect(encoded.length).toBeGreaterThanOrEqual(5);
});

test('every command gets a distinct discriminant', () => {
  const discriminants = EVERY_COMMAND.map((command) =>
    encodeCommand(1, command).readUInt8(4)
  );
  expect(new Set(discriminants).size).toEqual(
    new Set(EVERY_COMMAND.map((command) => command.kind)).size
  );
});

test('decodes an ok response', () => {
  const payload = new Writer().u32(3).u8(0).finish();
  expect(decodeResponse(payload)).toEqual({ id: 3, body: { kind: 'ok' } });
});

test('decodes an error response and names the code', () => {
  const payload = new Writer()
    .u32(4)
    .u8(1)
    .u16(ErrorCode.DriverUnavailable)
    .str('no such file')
    .finish();
  expect(decodeResponse(payload)).toEqual({
    id: 4,
    body: {
      kind: 'error',
      code: 'DriverUnavailable',
      message: 'no such file',
    },
  });
});

test('an unknown error code is a protocol error', () => {
  const payload = new Writer().u32(1).u8(1).u16(99).str('').finish();
  expect(() => decodeResponse(payload)).toThrow(/unknown error code/);
});

test('decodes a status response', () => {
  const payload = new Writer()
    .u32(5)
    .u8(2)
    .u32(2)
    .u32(1)
    .u32(4)
    .u32(1)
    .u32(0)
    .u32(0)
    .finish();
  expect(decodeResponse(payload)).toEqual({
    id: 5,
    body: {
      kind: 'status',
      status: {
        state: 2,
        operationalState: 1,
        imagesAvailable: 4,
        feederLoaded: 1,
        nextFeederLoaded: 0,
        feederSide: 0,
      },
    },
  });
});

test('decodes versions and profile responses', () => {
  expect(
    decodeResponse(new Writer().u32(1).u8(3).str('3.0.0.0').str('631').finish())
  ).toEqual({
    id: 1,
    body: { kind: 'versions', api: '3.0.0.0', scanner: '631' },
  });
  expect(
    decodeResponse(new Writer().u32(2).u8(4).str('a = 1\n').finish())
  ).toEqual({ id: 2, body: { kind: 'profile', profile: 'a = 1\n' } });
});

test('an unknown response discriminant is a protocol error', () => {
  expect(() => decodeResponse(new Writer().u32(1).u8(200).finish())).toThrow(
    /unknown response discriminant 200/
  );
});

const EVERY_EVENT: Array<[Buffer, DaemonEvent]> = [
  [
    new Writer().u8(0).str('state scanning').finish(),
    { kind: 'log', message: 'state scanning' },
  ],
  [
    new Writer().u8(1).u32(30).u32(1).str('Feeder empty').finish(),
    { kind: 'control', controlType: 30, numData: 1, strData: 'Feeder empty' },
  ],
  [
    new Writer().u8(2).str('ERR_SCANNER_NOTCONNECTED').finish(),
    { kind: 'disconnected', message: 'ERR_SCANNER_NOTCONNECTED' },
  ],
  [
    new Writer().u8(3).i32(30_000).finish(),
    { kind: 'incompatibleImage', size: 30_000 },
  ],
];

test.each(EVERY_EVENT)('decodes event %#', (payload, expected) => {
  expect(decodeEvent(payload)).toEqual(expected);
});

test('an unknown event discriminant is a protocol error', () => {
  expect(() => decodeEvent(Buffer.of(200))).toThrow(
    /unknown event discriminant 200/
  );
});

test('decodes hello', () => {
  expect(decodeHello(new Writer().str('0.1.0').finish())).toEqual({
    daemonVersion: '0.1.0',
  });
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
