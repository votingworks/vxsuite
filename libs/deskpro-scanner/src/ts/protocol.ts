/** Wire protocol shared with `rust/src/protocol.rs`; change both together. */

import { Buffer } from 'node:buffer';
import { throwIllegalValue } from '@votingworks/basics';
import { ProtocolError } from './protocol_error.js';
import { Reader } from './reader.js';
import { Writer } from './writer.js';

export { ProtocolError } from './protocol_error.js';
export { Reader } from './reader.js';
export { Writer } from './writer.js';

/** Frame types in either direction. */
export const FrameType = {
  Hello: 1,
  Command: 2,
  Response: 3,
  Event: 4,
  Image: 5,
} as const;

/** A `u8` frame type followed by a `u32` payload length. */
export const FRAME_HEADER_LENGTH = 5;

/** Must match `MAX_FRAME_PAYLOAD` in `protocol.rs`. */
export const MAX_FRAME_PAYLOAD = 64 * 1024 * 1024;

/** Wraps a payload in a frame header. */
export function encodeFrame(frameType: number, payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(FRAME_HEADER_LENGTH);
  header.writeUInt8(frameType, 0);
  header.writeUInt32LE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/** A decoded frame header. */
export interface FrameHeader {
  readonly frameType: number;
  readonly length: number;
}

/** Reads a frame header, rejecting oversized payloads. */
export function decodeFrameHeader(header: Buffer): FrameHeader {
  const length = header.readUInt32LE(1);
  if (length > MAX_FRAME_PAYLOAD) {
    throw new ProtocolError(
      `frame payload of ${length} bytes exceeds the ${MAX_FRAME_PAYLOAD} byte maximum`
    );
  }
  return { frameType: header.readUInt8(0), length };
}

const CommandKind = {
  Exit: 0,
  Connect: 1,
  Disconnect: 2,
  GetStatus: 3,
  GetVersions: 4,
  GetProfile: 5,
  SetProfile: 6,
  SetReady: 7,
  ScanStart: 8,
  ScanStop: 9,
  ScanPause: 10,
  ScanResume: 11,
  SetImprinterText: 12,
  SetCounter: 13,
  SetNumberOfSheets: 14,
} as const;

/** A request to the daemon. */
export type Command =
  | { readonly kind: 'exit' }
  | { readonly kind: 'connect'; readonly appId: string }
  | { readonly kind: 'disconnect' }
  | { readonly kind: 'getStatus' }
  | { readonly kind: 'getVersions' }
  | { readonly kind: 'getProfile' }
  | { readonly kind: 'setProfile'; readonly profile: string }
  | { readonly kind: 'setReady'; readonly ready: boolean }
  | { readonly kind: 'scanStart' }
  | { readonly kind: 'scanStop' }
  | { readonly kind: 'scanPause' }
  | { readonly kind: 'scanResume' }
  | { readonly kind: 'setImprinterText'; readonly text: string }
  | {
      readonly kind: 'setCounter';
      readonly index: number;
      readonly value: number;
    }
  | { readonly kind: 'setNumberOfSheets'; readonly count: number };

/** Encodes a command with the id its response will echo back. */
export function encodeCommand(id: number, command: Command): Buffer {
  const w = new Writer().u32(id);
  switch (command.kind) {
    case 'exit':
      w.u8(CommandKind.Exit);
      break;
    case 'connect':
      w.u8(CommandKind.Connect).str(command.appId);
      break;
    case 'disconnect':
      w.u8(CommandKind.Disconnect);
      break;
    case 'getStatus':
      w.u8(CommandKind.GetStatus);
      break;
    case 'getVersions':
      w.u8(CommandKind.GetVersions);
      break;
    case 'getProfile':
      w.u8(CommandKind.GetProfile);
      break;
    case 'setProfile':
      w.u8(CommandKind.SetProfile).str(command.profile);
      break;
    case 'setReady':
      w.u8(CommandKind.SetReady).bool(command.ready);
      break;
    case 'scanStart':
      w.u8(CommandKind.ScanStart);
      break;
    case 'scanStop':
      w.u8(CommandKind.ScanStop);
      break;
    case 'scanPause':
      w.u8(CommandKind.ScanPause);
      break;
    case 'scanResume':
      w.u8(CommandKind.ScanResume);
      break;
    case 'setImprinterText':
      w.u8(CommandKind.SetImprinterText).str(command.text);
      break;
    case 'setCounter':
      w.u8(CommandKind.SetCounter).u8(command.index).i64(command.value);
      break;
    case 'setNumberOfSheets':
      w.u8(CommandKind.SetNumberOfSheets).u32(command.count);
      break;
    default:
      throwIllegalValue(command);
  }
  return w.finish();
}

/** Must match `Response` in `protocol.rs`. */
export const ResponseKind = {
  Ok: 0,
  Error: 1,
  Status: 2,
  Versions: 3,
  Profile: 4,
} as const;

/** Must match `ErrorCode` in `protocol.rs`. */
export const ErrorCode = {
  DriverUnavailable: 1,
  NotConnected: 2,
  AlreadyConnected: 3,
  Driver: 4,
  BadRequest: 5,
  Other: 6,
} as const;

/** The name of an {@link ErrorCode}. */
export type ErrorCodeName = keyof typeof ErrorCode;

const ERROR_CODE_NAMES: ReadonlyMap<number, ErrorCodeName> = new Map(
  Object.entries(ErrorCode).map(([name, value]) => [
    value,
    name as ErrorCodeName,
  ])
);

/** The scanner's state words, raw; the vendor headers do not define their values. */
export interface Status {
  readonly state: number;
  readonly operationalState: number;
  readonly imagesAvailable: number;
  readonly feederLoaded: number;
  readonly nextFeederLoaded: number;
  readonly feederSide: number;
}

/** The daemon's answer to one command. */
export type ResponseBody =
  | { readonly kind: 'ok' }
  | {
      readonly kind: 'error';
      readonly code: ErrorCodeName;
      readonly message: string;
    }
  | { readonly kind: 'status'; readonly status: Status }
  | {
      readonly kind: 'versions';
      readonly api: string;
      readonly scanner: string;
    }
  | { readonly kind: 'profile'; readonly profile: string };

/** A response together with the id of the command it answers. */
export interface Response {
  readonly id: number;
  readonly body: ResponseBody;
}

/** Decodes a response frame payload. */
export function decodeResponse(payload: Buffer): Response {
  const r = new Reader(payload);
  const id = r.u32();
  const kind = r.u8();
  let body: ResponseBody;
  switch (kind) {
    case ResponseKind.Ok:
      body = { kind: 'ok' };
      break;
    case ResponseKind.Error: {
      const rawCode = r.u16();
      const code = ERROR_CODE_NAMES.get(rawCode);
      if (code === undefined) {
        throw new ProtocolError(`unknown error code discriminant ${rawCode}`);
      }
      body = { kind: 'error', code, message: r.str() };
      break;
    }
    case ResponseKind.Status:
      body = {
        kind: 'status',
        status: {
          state: r.u32(),
          operationalState: r.u32(),
          imagesAvailable: r.u32(),
          feederLoaded: r.u32(),
          nextFeederLoaded: r.u32(),
          feederSide: r.u32(),
        },
      };
      break;
    case ResponseKind.Versions:
      body = { kind: 'versions', api: r.str(), scanner: r.str() };
      break;
    case ResponseKind.Profile:
      body = { kind: 'profile', profile: r.str() };
      break;
    default:
      throw new ProtocolError(`unknown response discriminant ${kind}`);
  }
  r.finish();
  return { id, body };
}

/** Must match `Event` in `protocol.rs`. */
export const EventKind = {
  Log: 0,
  Control: 1,
  Disconnected: 2,
  IncompatibleImage: 3,
} as const;

/** Something the driver reported that no command asked for. */
export type DaemonEvent =
  | { readonly kind: 'log'; readonly message: string }
  /** A raw `ScannerControl_t`; the vendor headers do not define the `CTYPE_*` payloads. */
  | {
      readonly kind: 'control';
      readonly controlType: number;
      readonly numData: number;
      readonly strData: string;
    }
  | { readonly kind: 'disconnected'; readonly message: string }
  | { readonly kind: 'incompatibleImage'; readonly size: number };

/** Decodes an event frame payload. */
export function decodeEvent(payload: Buffer): DaemonEvent {
  const r = new Reader(payload);
  const kind = r.u8();
  let event: DaemonEvent;
  switch (kind) {
    case EventKind.Log:
      event = { kind: 'log', message: r.str() };
      break;
    case EventKind.Control:
      event = {
        kind: 'control',
        controlType: r.u32(),
        numData: r.u32(),
        strData: r.str(),
      };
      break;
    case EventKind.Disconnected:
      event = { kind: 'disconnected', message: r.str() };
      break;
    case EventKind.IncompatibleImage:
      event = { kind: 'incompatibleImage', size: r.i32() };
      break;
    default:
      throw new ProtocolError(`unknown event discriminant ${kind}`);
  }
  r.finish();
  return event;
}

/** The `ImageProperties_t` fields carried across the wire. */
export interface ImageHeader {
  /** Pairs the two sides of one sheet. */
  readonly seqId: number;
  readonly streamId: number;
  /** 0 = front, 1 = back, per `ImageProperties_t.scanSide`. */
  readonly scanSide: number;
  readonly resolution: number;
  readonly pixelsPerLine: number;
  readonly lines: number;
  readonly bytesPerLine: number;
  readonly bitsPerPixel: number;
  /** `ImageProperties_t.fileformat`; 2 is BMP. */
  readonly fileFormat: number;
  readonly compression: number;
  readonly doubleFeed: number;
  readonly blankPage: number;
  readonly integrity: number;
  readonly counters: readonly [number, number, number, number];
  /** What the imprinter reports for this side. */
  readonly endorserFrontText: string;
  readonly endorserBackText: string;
}

/** One side of one sheet. */
export interface ScannedImage {
  readonly header: ImageHeader;
  /** A subarray of the received frame, not a copy. */
  readonly data: Buffer;
}

/** Decodes an image frame payload, borrowing the pixels from it. */
export function decodeImage(payload: Buffer): ScannedImage {
  const r = new Reader(payload);
  const header: ImageHeader = {
    seqId: r.i64(),
    streamId: r.i32(),
    scanSide: r.i32(),
    resolution: r.i32(),
    pixelsPerLine: r.i32(),
    lines: r.i32(),
    bytesPerLine: r.i32(),
    bitsPerPixel: r.i32(),
    fileFormat: r.i32(),
    compression: r.i32(),
    doubleFeed: r.i32(),
    blankPage: r.i32(),
    integrity: r.i32(),
    counters: [r.i64(), r.i64(), r.i64(), r.i64()],
    endorserFrontText: r.str(),
    endorserBackText: r.str(),
  };
  const data = r.bytes();
  r.finish();
  return { header, data };
}

/** The first frame the daemon writes. */
export interface Hello {
  readonly daemonVersion: string;
}

/** Decodes a hello frame payload. */
export function decodeHello(payload: Buffer): Hello {
  const r = new Reader(payload);
  const hello: Hello = { daemonVersion: r.str() };
  r.finish();
  return hello;
}
