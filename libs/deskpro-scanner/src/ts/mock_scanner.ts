import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';
import {
  type Command,
  type DaemonEvent,
  type ErrorCodeName,
  FRAME_HEADER_LENGTH,
  FrameType,
  type ImageHeader,
  type ResponseBody,
  type Status,
  decodeCommand,
  decodeFrameHeader,
  encodeEvent,
  encodeFrame,
  encodeHello,
  encodeImage,
  encodeResponse,
} from './protocol.js';
import type { Transport } from './scanner_client.js';

/** An in-process stand-in for `deskproctl` that speaks the same wire protocol. */
export interface MockScannerDaemon {
  readonly transport: Transport;
  /** Commands the client has sent. */
  readonly received: MockCommand[];
  /** Answers the oldest unanswered command with `ok`. */
  respondOk(): void;
  respondError(code: ErrorCodeName, message: string): void;
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

/** A command the mock received. */
export interface MockCommand {
  readonly id: number;
  readonly body: Command;
}

/** Builds a mock daemon and the transport a {@link ScannerClient} attaches to. */
export function createMockDaemon(): MockScannerDaemon {
  const incoming = new PassThrough();
  const outgoing = new PassThrough();
  const received: MockCommand[] = [];
  const unanswered: number[] = [];
  const closeListeners: Array<(reason: string) => void> = [];
  let closedReason: string | undefined;
  let buffer = Buffer.alloc(0);

  outgoing.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < FRAME_HEADER_LENGTH) return;
      const { length } = decodeFrameHeader(buffer);
      if (buffer.length < FRAME_HEADER_LENGTH + length) return;
      const payload = buffer.subarray(
        FRAME_HEADER_LENGTH,
        FRAME_HEADER_LENGTH + length
      );
      buffer = buffer.subarray(FRAME_HEADER_LENGTH + length);
      const command: MockCommand = decodeCommand(payload);
      received.push(command);
      unanswered.push(command.id);
    }
  });

  function send(frameType: number, payload: Buffer): void {
    incoming.write(encodeFrame(frameType, payload));
  }

  function notifyClose(reason: string): void {
    closedReason = reason;
    for (const listener of closeListeners) {
      listener(reason);
    }
  }

  function respond(body: ResponseBody): void {
    const id = unanswered.shift();
    if (id === undefined) {
      throw new Error('no unanswered command to respond to');
    }
    send(FrameType.Response, encodeResponse({ id, body }));
  }

  const transport: Transport = {
    incoming,
    outgoing,
    onClose(listener) {
      closeListeners.push(listener);
      if (closedReason !== undefined) listener(closedReason);
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
      respond({ kind: 'ok' });
    },

    respondError(code, message) {
      respond({ kind: 'error', code, message });
    },

    respondStatus(status) {
      respond({ kind: 'status', status });
    },

    respondVersions(api, scanner) {
      respond({ kind: 'versions', api, scanner });
    },

    respondProfile(profile) {
      respond({ kind: 'profile', profile });
    },

    respondToUnknownCommand() {
      send(
        FrameType.Response,
        encodeResponse({ id: 0xffff, body: { kind: 'ok' } })
      );
    },

    sendHello() {
      send(FrameType.Hello, encodeHello({ daemonVersion: '0.0.0-mock' }));
    },

    sendEvent(event) {
      send(FrameType.Event, encodeEvent(event));
    },

    sendImage(header, data) {
      send(FrameType.Image, encodeImage({ header, data }));
    },

    sendRaw(frame) {
      incoming.write(frame);
    },

    close(reason = 'mock daemon closed') {
      notifyClose(reason);
    },
  };
}
