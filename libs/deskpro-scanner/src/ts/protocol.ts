/** Wire protocol shared with `rust/src/protocol.rs`; change both together. */

import { Buffer } from 'node:buffer';
import { Decoder, Encoder } from 'cbor-x';
import { z } from 'zod';
import { extractErrorMessage } from '@votingworks/basics';
import { ProtocolError } from './protocol_error.js';

export { ProtocolError } from './protocol_error.js';

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

const encoder = new Encoder({
  useRecords: false,
  variableMapSize: true,
  tagUint8Array: false,
});

const decoder = new Decoder({ useRecords: false, mapsAsObjects: true });

const U8 = z.int().min(0).max(0xff);
const U32 = z.int().min(0).max(0xffff_ffff);
const I32 = z.int().min(-0x8000_0000).max(0x7fff_ffff);
/**
 * `int64_t`; the driver's values (sequence ids, counters) fit in a safe integer. `cbor-x` decodes
 * 8-byte integers as `bigint`.
 */
const I64 = z.union([
  z.int(),
  z
    .bigint()
    .min(BigInt(Number.MIN_SAFE_INTEGER))
    .max(BigInt(Number.MAX_SAFE_INTEGER))
    .pipe(z.coerce.number()),
]);

function decodeAs<T>(schema: z.ZodType<T>, payload: Buffer): T {
  let value: unknown;
  try {
    value = decoder.decode(payload);
  } catch (error) {
    throw new ProtocolError(`invalid CBOR: ${extractErrorMessage(error)}`);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProtocolError(z.prettifyError(result.error));
  }
  return result.data;
}

/**
 * `cbor-x` writes integers wider than 32 bits as float64, which `i64` fields reject, so send
 * those as `bigint`.
 */
function int64(value: number): number | bigint {
  return value >= -0x8000_0000 && value <= 0xffff_ffff ? value : BigInt(value);
}

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
  | {
      readonly kind: 'setImprinterText';
      readonly side: ImprinterSide;
      readonly text: string;
    }
  | {
      readonly kind: 'setCounter';
      readonly index: number;
      readonly value: number;
    }
  | { readonly kind: 'setNumberOfSheets'; readonly count: number };

/** Which side of the sheet an imprinter template applies to. */
export type ImprinterSide = 'front' | 'back';

const CommandSchema: z.ZodType<Command> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exit') }),
  z.object({ kind: z.literal('connect'), appId: z.string() }),
  z.object({ kind: z.literal('disconnect') }),
  z.object({ kind: z.literal('getStatus') }),
  z.object({ kind: z.literal('getVersions') }),
  z.object({ kind: z.literal('getProfile') }),
  z.object({ kind: z.literal('setProfile'), profile: z.string() }),
  z.object({ kind: z.literal('setReady'), ready: z.boolean() }),
  z.object({ kind: z.literal('scanStart') }),
  z.object({ kind: z.literal('scanStop') }),
  z.object({ kind: z.literal('scanPause') }),
  z.object({ kind: z.literal('scanResume') }),
  z.object({
    kind: z.literal('setImprinterText'),
    side: z.enum(['front', 'back']),
    text: z.string(),
  }),
  z.object({ kind: z.literal('setCounter'), index: U8, value: I64 }),
  z.object({ kind: z.literal('setNumberOfSheets'), count: U32 }),
]);

/** A command together with the id its response will echo back. */
export interface CommandFrame {
  readonly id: number;
  readonly body: Command;
}

const CommandFrameSchema: z.ZodType<CommandFrame> = z.object({
  id: U32,
  body: CommandSchema,
});

/** Encodes a command with the id its response will echo back; throws if a field is out of range. */
export function encodeCommand(id: number, command: Command): Buffer {
  const result = CommandFrameSchema.safeParse({ id, body: command });
  if (!result.success) {
    throw new ProtocolError(z.prettifyError(result.error));
  }
  const body =
    command.kind === 'setCounter'
      ? { ...command, value: int64(command.value) }
      : command;
  return encoder.encode({ id, body });
}

/** Decodes a command frame payload. */
export function decodeCommand(payload: Buffer): CommandFrame {
  return decodeAs(CommandFrameSchema, payload);
}

const ErrorCodeSchema = z.enum([
  'driverUnavailable',
  'notConnected',
  'alreadyConnected',
  'driver',
  'badRequest',
  'other',
]);

/** Must match `ErrorCode` in `protocol.rs`; these are also `ScannerError` codes. */
export const ERROR_CODES = ErrorCodeSchema.options;

/** One of {@link ERROR_CODES}. */
export type ErrorCodeName = z.infer<typeof ErrorCodeSchema>;

/** The scanner's state words, raw; the vendor headers do not define their values. */
export interface Status {
  readonly state: number;
  readonly operationalState: number;
  readonly imagesAvailable: number;
  readonly feederLoaded: number;
  readonly nextFeederLoaded: number;
  readonly feederSide: number;
}

const StatusSchema: z.ZodType<Status> = z.object({
  state: U32,
  operationalState: U32,
  imagesAvailable: U32,
  feederLoaded: U32,
  nextFeederLoaded: U32,
  feederSide: U32,
});

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

const ResponseSchema: z.ZodType<Response> = z.object({
  id: U32,
  body: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ok') }),
    z.object({
      kind: z.literal('error'),
      code: ErrorCodeSchema,
      message: z.string(),
    }),
    z.object({ kind: z.literal('status'), status: StatusSchema }),
    z.object({
      kind: z.literal('versions'),
      api: z.string(),
      scanner: z.string(),
    }),
    z.object({ kind: z.literal('profile'), profile: z.string() }),
  ]),
});

/** Decodes a response frame payload. */
export function decodeResponse(payload: Buffer): Response {
  return decodeAs(ResponseSchema, payload);
}

/** Encodes a response frame payload, as the daemon does. */
export function encodeResponse(response: Response): Buffer {
  return encoder.encode(response);
}

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
  /** The daemon lost the scanner and is exiting; start a new client to reconnect. */
  | { readonly kind: 'disconnected'; readonly message: string }
  | { readonly kind: 'incompatibleImage'; readonly size: number }
  /** The scanner's operational state changed; 0 while an error is active. */
  | { readonly kind: 'operationalState'; readonly state: number }
  /** An image's frame would exceed {@link MAX_FRAME_PAYLOAD}, so the daemon dropped it. */
  | {
      readonly kind: 'oversizedImage';
      readonly seqId: number;
      readonly scanSide: number;
      readonly size: number;
    };

const DaemonEventSchema: z.ZodType<DaemonEvent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('log'), message: z.string() }),
  z.object({
    kind: z.literal('control'),
    controlType: U32,
    numData: U32,
    strData: z.string(),
  }),
  z.object({ kind: z.literal('disconnected'), message: z.string() }),
  z.object({ kind: z.literal('incompatibleImage'), size: I32 }),
  z.object({ kind: z.literal('operationalState'), state: I32 }),
  z.object({
    kind: z.literal('oversizedImage'),
    seqId: I64,
    scanSide: I32,
    size: I64,
  }),
]);

/** Decodes an event frame payload. */
export function decodeEvent(payload: Buffer): DaemonEvent {
  return decodeAs(DaemonEventSchema, payload);
}

/** Encodes an event frame payload, as the daemon does. */
export function encodeEvent(event: DaemonEvent): Buffer {
  return encoder.encode(event);
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
  /** What the imprinter printed on the sheet's front, if anything. */
  readonly endorserFrontText?: string;
  /** What the imprinter printed on the sheet's back, if anything. */
  readonly endorserBackText?: string;
}

const ImageHeaderSchema: z.ZodType<ImageHeader> = z.object({
  seqId: I64,
  streamId: I32,
  scanSide: I32,
  resolution: I32,
  pixelsPerLine: I32,
  lines: I32,
  bytesPerLine: I32,
  bitsPerPixel: I32,
  fileFormat: I32,
  compression: I32,
  doubleFeed: I32,
  blankPage: I32,
  integrity: I32,
  counters: z.tuple([I64, I64, I64, I64]),
  endorserFrontText: z.string().optional(),
  endorserBackText: z.string().optional(),
});

/** One side of one sheet. */
export interface ScannedImage {
  readonly header: ImageHeader;
  /** A subarray of the received frame, not a copy. */
  readonly data: Buffer;
}

const IMAGE_HEADER_LENGTH_SIZE = 4;

/** Decodes an image frame payload, borrowing the pixels. */
export function decodeImage(payload: Buffer): ScannedImage {
  if (payload.length < IMAGE_HEADER_LENGTH_SIZE) {
    throw new ProtocolError('image payload has no header length');
  }
  const headerEnd = IMAGE_HEADER_LENGTH_SIZE + payload.readUInt32LE(0);
  if (headerEnd > payload.length) {
    throw new ProtocolError(
      `${headerEnd - IMAGE_HEADER_LENGTH_SIZE}-byte image header declared, ${
        payload.length - IMAGE_HEADER_LENGTH_SIZE
      } bytes present`
    );
  }
  return {
    header: decodeAs(
      ImageHeaderSchema,
      payload.subarray(IMAGE_HEADER_LENGTH_SIZE, headerEnd)
    ),
    data: payload.subarray(headerEnd),
  };
}

/** Encodes an image frame payload, as the daemon does. */
export function encodeImage({ header, data }: ScannedImage): Buffer {
  const encodedHeader = encoder.encode({
    ...header,
    counters: header.counters.map(int64),
  });
  const headerLength = Buffer.alloc(IMAGE_HEADER_LENGTH_SIZE);
  headerLength.writeUInt32LE(encodedHeader.length);
  return Buffer.concat([headerLength, encodedHeader, data]);
}

/** The first frame the daemon writes. */
export interface Hello {
  readonly daemonVersion: string;
}

const HelloSchema: z.ZodType<Hello> = z.object({ daemonVersion: z.string() });

/** Decodes a hello frame payload. */
export function decodeHello(payload: Buffer): Hello {
  return decodeAs(HelloSchema, payload);
}

/** Encodes a hello frame payload, as the daemon does. */
export function encodeHello(hello: Hello): Buffer {
  return encoder.encode(hello);
}
