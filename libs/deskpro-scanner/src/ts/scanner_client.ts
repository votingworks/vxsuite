import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import makeDebug from 'debug';
import {
  assertDefined,
  deferred,
  type Deferred,
  type Result,
  err,
  extractErrorMessage,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  type Command,
  type DaemonEvent,
  type ErrorCodeName,
  FRAME_HEADER_LENGTH,
  FrameType,
  type Hello,
  ProtocolError,
  type Response,
  type ResponseBody,
  type ScannedImage,
  type Status,
  decodeEvent,
  decodeFrameHeader,
  decodeHello,
  decodeImage,
  decodeResponse,
  encodeCommand,
  encodeFrame,
} from './protocol.js';

const debug = makeDebug('deskpro-scanner');

/** Where `build:self` puts `deskproctl`; turbo hides `CARGO_TARGET_DIR`, so this never follows it. */
export const DEFAULT_DAEMON_PATH = join(
  assertDefined(import.meta.dirname.split('libs')[0]),
  'libs/deskpro-scanner/target/release/deskproctl'
);

/** A byte pipe to a `deskproctl` process or to {@link createMockDaemon}. */
export interface Transport {
  readonly incoming: Readable;
  readonly outgoing: Writable;
  /** Called with a reason when the far end goes away. */
  onClose(listener: (reason: string) => void): void;
  close(): void;
}

/** Runs `deskproctl` as a child process and exposes its stdio as a {@link Transport}. */
export function spawnDaemon(daemonPath = DEFAULT_DAEMON_PATH): Transport {
  const child = spawn(daemonPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdin.on('error', (error) => {
    debug('deskproctl stdin: %s', error.message);
    child.kill('SIGTERM');
  });
  return {
    incoming: child.stdout,
    outgoing: child.stdin,
    onClose(listener) {
      child.on('error', (error) => listener(error.message));
      child.on('exit', (code, signal) =>
        listener(`deskproctl exited with code ${code}, signal ${signal}`)
      );
    },
    close() {
      child.kill('SIGTERM');
    },
  };
}

/** Why a command failed. */
export interface ScannerError {
  readonly code:
    | 'driverUnavailable'
    | 'notConnected'
    | 'alreadyConnected'
    | 'driver'
    | 'badRequest'
    | 'other'
    | 'daemonExited'
    | 'protocol';
  readonly message: string;
}

/** The result of a command. */
export type ScannerResult<T> = Result<T, ScannerError>;

/** Events emitted by {@link ScannerClient}. */
export interface ScannerClientEvents {
  image: [ScannedImage];
  event: [DaemonEvent];
  /** The transport went away. Every pending command has already been rejected. */
  close: [string];
}

/**
 * Drives `deskproctl` over the binary protocol. To recover from a daemon failure, stop this
 * client and construct a new one.
 */
export class ScannerClient extends EventEmitter<ScannerClientEvents> {
  private buffer = Buffer.alloc(0);
  private nextCommandId = 1;
  private readonly pending = new Map<number, Deferred<ResponseBody>>();
  private closed?: ScannerError;
  private transportClosed = false;
  private started = false;
  private helloWaiter?: Deferred<ScannerResult<Hello>>;
  private readonly transport: Transport;

  constructor(transport: Transport = spawnDaemon()) {
    super();
    this.transport = transport;
  }

  /** Waits for the daemon's hello frame. */
  start(): Promise<ScannerResult<Hello>> {
    if (this.started) {
      return Promise.resolve(
        err({ code: 'other', message: 'already started' })
      );
    }
    this.started = true;

    const helloReceived = deferred<ScannerResult<Hello>>();
    this.helloWaiter = helloReceived;

    this.transport.incoming.on('data', (chunk: Buffer) => {
      if (this.closed) return;
      this.buffer = Buffer.concat([this.buffer, chunk]);
      try {
        this.drainFrames();
      } catch (error) {
        this.fail({ code: 'protocol', message: extractErrorMessage(error) });
        this.transport.close();
      }
    });

    this.transport.onClose((reason) => {
      if (this.transportClosed) return;
      this.transportClosed = true;
      this.fail({ code: 'daemonExited', message: reason });
      this.emit('close', reason);
    });

    return helloReceived.promise;
  }

  /** Stops the daemon. Safe to call more than once. */
  stop(): void {
    this.transport.close();
  }

  connect(appId: string): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'connect', appId });
  }

  disconnect(): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'disconnect' });
  }

  /** Asks the daemon to exit cleanly, rather than killing it. */
  exit(): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'exit' });
  }

  async getStatus(): Promise<ScannerResult<Status>> {
    return unwrap(
      await this.send({ kind: 'getStatus' }),
      'status',
      (body) => body.status
    );
  }

  async getVersions(): Promise<
    ScannerResult<{ api: string; scanner: string }>
  > {
    return unwrap(
      await this.send({ kind: 'getVersions' }),
      'versions',
      ({ api, scanner }) => ({ api, scanner })
    );
  }

  /** The active profile, as the driver's `Section_field = value` text. */
  async getProfile(): Promise<ScannerResult<string>> {
    return unwrap(
      await this.send({ kind: 'getProfile' }),
      'profile',
      (body) => body.profile
    );
  }

  setProfile(profile: string): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'setProfile', profile });
  }

  setReady(ready: boolean): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'setReady', ready });
  }

  scanStart(): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'scanStart' });
  }

  scanStop(): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'scanStop' });
  }

  /** Stops the feeder without ending the batch. */
  scanPause(): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'scanPause' });
  }

  scanResume(): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'scanResume' });
  }

  setImprinterText(text: string): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'setImprinterText', text });
  }

  setCounter(index: number, value: number): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'setCounter', index, value });
  }

  setNumberOfSheets(count: number): Promise<ScannerResult<void>> {
    return this.expectOk({ kind: 'setNumberOfSheets', count });
  }

  private async expectOk(command: Command): Promise<ScannerResult<void>> {
    return unwrap(await this.send(command), 'ok', () => undefined);
  }

  private send(command: Command): Promise<ScannerResult<ResponseBody>> {
    if (this.closed) {
      return Promise.resolve(err(this.closed));
    }

    const id = this.nextCommandId;
    this.nextCommandId += 1;
    const pending = deferred<ResponseBody>();
    this.pending.set(id, pending);
    debug('command %d: %o', id, command);
    this.transport.outgoing.write(
      encodeFrame(FrameType.Command, encodeCommand(id, command))
    );

    return pending.promise.then(
      (body) =>
        body.kind === 'error'
          ? err({ code: toClientCode(body.code), message: body.message })
          : ok(body),
      (error: Error) =>
        err({ code: 'daemonExited' as const, message: error.message })
    );
  }

  /** Pulls every complete frame out of the read buffer. */
  private drainFrames(): void {
    for (;;) {
      if (this.buffer.length < FRAME_HEADER_LENGTH) return;
      const { length } = decodeFrameHeader(this.buffer);
      if (this.buffer.length < FRAME_HEADER_LENGTH + length) return;

      // Copy the frame so an image's `data` subarray doesn't pin the whole read buffer.
      const frame = Buffer.from(
        this.buffer.subarray(0, FRAME_HEADER_LENGTH + length)
      );
      this.buffer = this.buffer.subarray(FRAME_HEADER_LENGTH + length);
      this.handleFrame(frame.readUInt8(0), frame.subarray(FRAME_HEADER_LENGTH));
    }
  }

  private handleFrame(frameType: number, payload: Buffer): void {
    switch (frameType) {
      case FrameType.Hello: {
        const hello = decodeHello(payload);
        this.helloWaiter?.resolve(ok(hello));
        return;
      }

      case FrameType.Response: {
        const response: Response = decodeResponse(payload);
        const pending = this.pending.get(response.id);
        if (!pending) {
          throw new ProtocolError(
            `response for unknown command id ${response.id}`
          );
        }
        this.pending.delete(response.id);
        pending.resolve(response.body);
        return;
      }

      case FrameType.Event:
        this.emit('event', decodeEvent(payload));
        return;

      case FrameType.Image:
        this.emit('image', decodeImage(payload));
        return;

      default:
        throw new ProtocolError(`unknown frame type ${frameType}`);
    }
  }

  /** Rejects everything outstanding and refuses anything new. Returns false if already failed. */
  private fail(error: ScannerError): boolean {
    if (this.closed) return false;
    this.closed = error;
    for (const pending of this.pending.values()) {
      pending.reject(new Error(error.message));
    }
    this.pending.clear();
    this.helloWaiter?.resolve(err(error));
    return true;
  }
}

function toClientCode(code: ErrorCodeName): ScannerError['code'] {
  switch (code) {
    case 'DriverUnavailable':
      return 'driverUnavailable';
    case 'NotConnected':
      return 'notConnected';
    case 'AlreadyConnected':
      return 'alreadyConnected';
    case 'Driver':
      return 'driver';
    case 'BadRequest':
      return 'badRequest';
    case 'Other':
      return 'other';
    default:
      throwIllegalValue(code);
  }
}

/** Narrows a response to the kind a command expects, or reports a protocol error. */
function unwrap<K extends ResponseBody['kind'], T>(
  result: ScannerResult<ResponseBody>,
  kind: K,
  extract: (body: Extract<ResponseBody, { kind: K }>) => T
): ScannerResult<T> {
  if (result.isErr()) {
    return result;
  }
  const body = result.ok();
  if (body.kind !== kind) {
    return err({
      code: 'protocol',
      message: `expected a ${kind} response, got ${body.kind}`,
    });
  }
  return ok(extract(body as Extract<ResponseBody, { kind: K }>));
}
