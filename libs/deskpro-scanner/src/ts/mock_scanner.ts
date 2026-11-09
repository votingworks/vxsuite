import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';
import { throwIllegalValue } from '@votingworks/basics';
import {
  type DaemonEvent,
  EventKind,
  FRAME_HEADER_LENGTH,
  FrameType,
  type ImageHeader,
  Reader,
  ResponseKind,
  type Status,
  Writer,
  encodeFrame,
} from './protocol.js';
import type { Transport } from './scanner_client.js';

/** An in-process stand-in for `deskproctl` that speaks the same wire protocol. */
export interface MockScannerDaemon {
  readonly transport: Transport;
  /** Commands the client has sent, decoded far enough to identify them. */
  readonly received: MockCommand[];
  /** Answers the oldest unanswered command with `ok`. */
  respondOk(): void;
  respondError(code: number, message: string): void;
  respondStatus(status: Status): void;
  respondVersions(api: string, scanner: string): void;
  respondProfile(profile: string): void;
  /** Answers with a response whose id matches nothing the client sent. */
  respondToUnknownCommand(): void;
  sendHello(): void;
  sendEvent(event: DaemonEvent): void;
  sendImage(header: ImageHeader, data: Buffer): void;
  sendRaw(frame: Buffer): void;
  /** Simulates the daemon dying. */
  close(reason?: string): void;
}

/** A command the mock received, decoded far enough to identify it. */
export interface MockCommand {
  readonly id: number;
  readonly kind: number;
}

/** Builds a mock daemon and the transport a {@link ScannerClient} attaches to. */
export function createMockDaemon(): MockScannerDaemon {
  const incoming = new PassThrough();
  const outgoing = new PassThrough();
  const received: MockCommand[] = [];
  const unanswered: number[] = [];
  const closeListeners: Array<(reason: string) => void> = [];
  let buffer = Buffer.alloc(0);

  outgoing.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < FRAME_HEADER_LENGTH) return;
      const length = buffer.readUInt32LE(1);
      if (buffer.length < FRAME_HEADER_LENGTH + length) return;
      const payload = buffer.subarray(
        FRAME_HEADER_LENGTH,
        FRAME_HEADER_LENGTH + length
      );
      buffer = buffer.subarray(FRAME_HEADER_LENGTH + length);
      const reader = new Reader(payload);
      const command: MockCommand = { id: reader.u32(), kind: reader.u8() };
      received.push(command);
      unanswered.push(command.id);
    }
  });

  function send(frameType: number, payload: Buffer): void {
    incoming.write(encodeFrame(frameType, payload));
  }

  function notifyClose(reason: string): void {
    for (const listener of closeListeners) {
      listener(reason);
    }
  }

  function respond(write: (writer: Writer) => void): void {
    const id = unanswered.shift();
    if (id === undefined) {
      throw new Error('no unanswered command to respond to');
    }
    const writer = new Writer().u32(id);
    write(writer);
    send(FrameType.Response, writer.finish());
  }

  const transport: Transport = {
    incoming,
    outgoing,
    onClose(listener) {
      closeListeners.push(listener);
    },
    close() {
      incoming.end();
      notifyClose('mock daemon stopped');
    },
  };

  return {
    transport,
    received,

    respondOk() {
      respond((w) => w.u8(ResponseKind.Ok));
    },

    respondError(code, message) {
      respond((w) => w.u8(ResponseKind.Error).u16(code).str(message));
    },

    respondStatus(status) {
      respond((w) =>
        w
          .u8(ResponseKind.Status)
          .u32(status.state)
          .u32(status.operationalState)
          .u32(status.imagesAvailable)
          .u32(status.feederLoaded)
          .u32(status.nextFeederLoaded)
          .u32(status.feederSide)
      );
    },

    respondVersions(api, scanner) {
      respond((w) => w.u8(ResponseKind.Versions).str(api).str(scanner));
    },

    respondProfile(profile) {
      respond((w) => w.u8(ResponseKind.Profile).str(profile));
    },

    respondToUnknownCommand() {
      send(
        FrameType.Response,
        new Writer().u32(0xffff).u8(ResponseKind.Ok).finish()
      );
    },

    sendHello() {
      send(FrameType.Hello, new Writer().str('0.0.0-mock').finish());
    },

    sendEvent(event) {
      const w = new Writer();
      switch (event.kind) {
        case 'log':
          w.u8(EventKind.Log).str(event.message);
          break;
        case 'control':
          w.u8(EventKind.Control)
            .u32(event.controlType)
            .u32(event.numData)
            .str(event.strData);
          break;
        case 'disconnected':
          w.u8(EventKind.Disconnected).str(event.message);
          break;
        case 'incompatibleImage':
          w.u8(EventKind.IncompatibleImage).i32(event.size);
          break;
        case 'operationalState':
          w.u8(EventKind.OperationalState).i32(event.state);
          break;
        case 'oversizedImage':
          w.u8(EventKind.OversizedImage)
            .i64(event.seqId)
            .i32(event.scanSide)
            .i64(event.size);
          break;
        default:
          throwIllegalValue(event);
      }
      send(FrameType.Event, w.finish());
    },

    sendImage(header, data) {
      const w = new Writer()
        .i64(header.seqId)
        .i32(header.streamId)
        .i32(header.scanSide)
        .i32(header.resolution)
        .i32(header.pixelsPerLine)
        .i32(header.lines)
        .i32(header.bytesPerLine)
        .i32(header.bitsPerPixel)
        .i32(header.fileFormat)
        .i32(header.compression)
        .i32(header.doubleFeed)
        .i32(header.blankPage)
        .i32(header.integrity);
      for (const counter of header.counters) {
        w.i64(counter);
      }
      w.str(header.endorserFrontText).str(header.endorserBackText).bytes(data);
      send(FrameType.Image, w.finish());
    },

    sendRaw(frame) {
      incoming.write(frame);
    },

    close(reason = 'mock daemon closed') {
      notifyClose(reason);
    },
  };
}
