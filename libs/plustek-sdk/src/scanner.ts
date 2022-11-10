/* eslint-disable max-classes-per-file */
import { err, ok, Result, safeParse, SheetOf } from '@votingworks/types';
import { deferred, throwIllegalValue } from '@votingworks/utils';
import { spawn } from 'child_process';
import makeDebug from 'debug';
import { createInterface } from 'readline';
import { inspect } from 'util';
import { Config, DEFAULT_CONFIG } from './config';
import { parseScannerError, ScannerError } from './errors';
import { PaperStatus, PaperStatusSchema } from './paper_status';
import { dir as createTempDir, file as createTempFile } from './util/temp';

const debug = makeDebug('plustek-sdk:scanner');

const CLI_DELIMITER = '<<<>>>';

/**
 * Base class for errors returned by {@link ScannerClient}.
 */
export class ClientError extends Error {}

/**
 * Error returned when the connection to `plustekctl` is broken, possibly
 * because stdout closed or the process exited.
 */
export class ClientDisconnectedError extends ClientError {}

/**
 * Error returned when `plustekctl` responds to a command with an unexpected
 * value.
 */
export class InvalidClientResponseError extends ClientError {}

/**
 * A collection of callbacks that will be called by {@link ScannerClient} at
 * various points in its lifecycle. This is similar to using an
 * {@link EventEmitter}, but more type-safe and intentionally less flexible.
 */
export interface ScannerClientCallbacks {
  onConfigResolved?(config: Config): void;
  onError?(error: Error): void;
  onConnecting?(): void;
  onWaitingForHandshake?(): void;
  onConnected?(): void;
  onDisconnected?(): void;
}

/**
 * The return type of {@link ScannerClient.getPaperStatus}.
 */
export type GetPaperStatusResult = Result<PaperStatus, ScannerError | Error>;

/**
 * The return type of {@link ScannerClient.scan}.
 */
export type ScanResult = Result<
  { files: SheetOf<string> },
  ScannerError | Error
>;

/**
 * The return type of {@link ScannerClient.accept}.
 */
export type AcceptResult = Result<void, ScannerError | Error>;

/**
 * The return type of {@link ScannerClient.reject}.
 */
export type RejectResult = Result<void, ScannerError | Error>;

/**
 * The return type of {@link ScannerClient.calibrate}.
 */
export type CalibrateResult = Result<void, ScannerError | Error>;

/**
 * The return type of {@link ScannerClient.close}.
 */
export type CloseResult = Result<void, ScannerError | Error>;

/**
 * A retry predicate is used by {@link ScannerClient} to determine whether a
 * {@link ScanResult} should be retried. This is useful if the calling code can
 * determine whether the error is likely to be transitory.
 */
export type ScanRetryPredicate = (result: ScanResult) => boolean;

/**
 * Provides access to a plustek scanner.
 */
export interface ScannerClient {
  /**
   * Returns whether this client has been connected and not yet disconnected.
   */
  isConnected(): boolean;

  /**
   * Gets the scanner's current paper status.
   */
  getPaperStatus(): Promise<GetPaperStatusResult>;

  /**
   * Scans the sheet fed into the scanner if one is present. Optionally provides
   * callbacks for handling multiple retry attempts.
   */
  scan(options?: {
    onScanAttemptStart?(attempt: number): void;
    onScanAttemptEnd?(attempt: number, result: ScanResult): void;
    shouldRetry?: ScanRetryPredicate;
  }): Promise<ScanResult>;

  /**
   * Accepts the sheet fed into the scanner wherever it is held (front or back).
   */
  accept(): Promise<AcceptResult>;

  /**
   * Rejects (and optionally holds) the sheet fed into the scanner, wherever it
   * is held (front or back).
   */
  reject(options: { hold: boolean }): Promise<RejectResult>;

  /**
   * Calibrates the scanner. Assumes that a sheet of white paper is being held
   * by the scanner ready to scan.
   */
  calibrate(): Promise<CalibrateResult>;

  /**
   * Disconnects from the scanner. Any further scanner operations after this
   * will fail and {@link isConnected} will return `false`.
   */
  close(): Promise<CloseResult>;

  /**
   * Kills the underlying plustekctl process. Should only be called if close()
   * does not work because the scanner is not responsive.
   */
  kill(): Result<void, ClientError>;
}

interface IpcHandlers<T> {
  ok?(resolve: (value: T) => void): void;
  data?(data: string, resolve: (value: T) => void): void;
  error(error: ScannerError | Error, resolve: (value: T) => void): void;
  else(line: string, resolve: (value: T) => void): void;
}

function noop() {
  // do nothing
}

type PlustekEvent = { type: 'line'; line: string } | { type: 'exit' };

/**
 * Creates a client to a plustek scanner using `plustekctl`. A long-lived child
 * process is created and IPC communication occurs over stdio. Commands are
 * queued and will be executed in serial, so if you e.g. call
 * {@link ScannerClient.scan} and then {@link ScannerClient.getPaperStatus},
 * the `scan` will complete first before issuing the `getPaperStatus` command.
 */
export async function createClient(
  config = DEFAULT_CONFIG,
  /* istanbul ignore next */
  {
    onConfigResolved = noop,
    onConnecting = noop,
    onConnected = noop,
    onDisconnected = noop,
    onError = noop,
    onWaitingForHandshake = noop,
  }: ScannerClientCallbacks = {}
): Promise<Result<ScannerClient, Error>> {
  const resolvedConfig: Config = {
    ...config,
    savepath: config.savepath ?? (await createTempDir()),
  };
  debug('opening scanner with config: %o', resolvedConfig);
  onConfigResolved(resolvedConfig);
  const configFilePath = await createTempFile(
    JSON.stringify(resolvedConfig, undefined, 2)
  );
  const args = ['--config', configFilePath, '--delimiter', CLI_DELIMITER];
  const plustekctlPath = 'plustekctl';
  debug('spawning: %s %o', plustekctlPath, args);
  const plustekctl = spawn(plustekctlPath, args, { stdio: 'pipe' });
  const clientDebug = makeDebug(
    `${debug.namespace}:client(pid=${plustekctl.pid})`
  );
  clientDebug('spawned %s', plustekctlPath);

  const { promise: connectedPromise, resolve: connectedResolve } =
    deferred<void>();
  const { promise: exitPromise, resolve: exitResolve } = deferred<void>();
  let setupError: Error | undefined;
  let connected = false;
  let interpreting = false;
  let quitting = false;
  let currentEventHandler: ((event: PlustekEvent) => void) | undefined;
  let currentIpcPromise = Promise.resolve();

  /* istanbul ignore next */
  createInterface(plustekctl.stderr).on('line', (line) => {
    clientDebug('stderr: %s', line);
  });

  plustekctl
    .on('error', (error) => {
      clientDebug('plustekctl error: %s', error);
      setupError = new ClientDisconnectedError(`connection error: ${error}`);
      onError(setupError);
      exitResolve();
    })
    .on('exit', (code, signal) => {
      clientDebug('plustekctl exit: code=%d, signal=%s', code, signal);
      connected = false;
      if (!quitting || code !== 0) {
        setupError = new ClientDisconnectedError(
          `connection error: ${plustekctlPath} exited unexpectedly (pid=${plustekctl.pid}, code=${code}, signal=${signal})`
        );
        onError(setupError);
        currentEventHandler?.({ type: 'exit' });
      }
      onDisconnected();
      exitResolve();
    });

  onConnecting();

  if (setupError) {
    return err(setupError);
  }

  const lines = createInterface(plustekctl.stdout);

  lines.on('line', (line) => {
    clientDebug('← %s', line);
    if (line === CLI_DELIMITER) {
      interpreting = !interpreting;
    } else if (interpreting) {
      /* istanbul ignore else */
      if (line === 'ready') {
        if (!connected) {
          connected = true;
          connectedResolve();
          onConnected();
        }
      } else if (currentEventHandler) {
        currentEventHandler({ type: 'line', line });
      } else {
        clientDebug('no registered IPC handling response line: %s', line);
      }
    }
  });

  async function doIpc<T>(
    method: string,
    handlers: IpcHandlers<T>
  ): Promise<T> {
    clientDebug('doIPC BEGIN (method=%s)', method);
    const { promise, resolve } = deferred<T>();

    // Build an IPC queue
    const previousIpcPromise = currentIpcPromise;
    currentIpcPromise = promise.then();
    await previousIpcPromise;

    if (!connected) {
      handlers.error(new ClientDisconnectedError(), resolve);
    }

    currentEventHandler = (event) => {
      /* istanbul ignore else */
      if (event.type === 'line') {
        const { line } = event;
        const match = line.trim().match(/^([^\s:]+):\s*(err=)?(.*)$/);

        if (match) {
          const [, responder, isError, data] = match;

          if (responder !== method) {
            handlers.else(line, resolve);
          } else if (isError) {
            handlers.error(parseScannerError(data), resolve);
          } else if (handlers.ok && data === 'ok') {
            handlers.ok(resolve);
          } else if (handlers.data) {
            handlers.data(data, resolve);
          } else {
            handlers.else(line, resolve);
          }
        } else {
          handlers.else(line, resolve);
        }
      } else if (event.type === 'exit') {
        handlers.error(new ClientDisconnectedError(), resolve);
      } else {
        throwIllegalValue(event, 'type');
      }
    };

    if (connected) {
      clientDebug('→ %s', method);
      plustekctl.stdin.write(method);
      plustekctl.stdin.write('\n');
    } else {
      clientDebug(
        'failing %s method because client is no longer connected',
        method
      );
      handlers.error(new ClientDisconnectedError(), resolve);
    }

    try {
      return await promise;
    } finally {
      currentEventHandler = undefined;
      clientDebug('doIPC END (method=%s)', method);
    }
  }

  onWaitingForHandshake();

  /* istanbul ignore next - unsure how to test this case */
  if (setupError) {
    return err(setupError);
  }

  await Promise.race([connectedPromise, exitPromise]);

  /* istanbul ignore next - unsure how to test this case */
  if (setupError) {
    return err(setupError);
  }

  const getPaperStatus: ScannerClient['getPaperStatus'] = () =>
    doIpc('get-paper-status', {
      data: (data, resolve) => resolve(safeParse(PaperStatusSchema, data)),
      error: (error, resolve) => resolve(err(error)),
      else: (line, resolve) =>
        resolve(
          err(new InvalidClientResponseError(`invalid response: ${line}`))
        ),
    });

  const client: ScannerClient = {
    isConnected: () => connected,

    getPaperStatus,

    scan: async ({
      onScanAttemptStart,
      onScanAttemptEnd,
      shouldRetry: shouldRetryPredicate,
    } = {}) => {
      clientDebug(
        'scan starting (with retry predicate? %s)',
        shouldRetryPredicate ? 'yes' : 'no'
      );

      for (let attempt = 0; ; attempt += 1) {
        clientDebug('scan attempt #%d starting', attempt);
        const files: string[] = [];
        const resultPromise = doIpc<ScanResult>('scan', {
          data: (data, resolve) => {
            const match = data.match(/^file=(.+)$/);

            if (match) {
              files.push(match[1]);
            } else {
              resolve(
                err(
                  new InvalidClientResponseError(
                    `unexpected response data: ${data}`
                  )
                )
              );
            }
          },
          ok: (resolve) => {
            if (files.length === 2) {
              const [front, back] = files;
              resolve(ok({ files: [front, back] }));
            } else {
              resolve(
                err(
                  new InvalidClientResponseError(
                    `expected two files, got: ${inspect(files)}`
                  )
                )
              );
            }
          },
          error: (error, resolve) => resolve(err(error)),
          else: (line, resolve) =>
            resolve(
              err(new InvalidClientResponseError(`invalid response: ${line}`))
            ),
        });

        onScanAttemptStart?.(attempt);
        const result = await resultPromise;
        onScanAttemptEnd?.(attempt, result);

        if (result.isOk()) {
          clientDebug('scan attempt #%d succeeded, returning result', attempt);
          return result;
        }

        const shouldRetry = shouldRetryPredicate?.(result);
        if (!shouldRetry) {
          clientDebug(
            'scan attempt #%d failed (%s) and will not retry',
            attempt,
            result.err()
          );
          return result;
        }

        clientDebug(
          'scan attempt #%d failed (%s) but will retry',
          attempt,
          result.err()
        );
      }
    },

    accept: () =>
      doIpc('accept', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      }),

    reject: ({ hold }) =>
      doIpc(hold ? 'reject-hold' : 'reject', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      }),

    calibrate: () =>
      doIpc('calibrate', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      }),

    close: () => {
      quitting = true;
      return doIpc('quit', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      });
    },

    kill: () => {
      debug('Killing plustekctl process');
      if (plustekctl.kill()) {
        debug('Killed plustekctl process');
        return ok();
      }
      debug('Failed to kill plustekctl process');
      return err(new ClientError('Failed to kill plustekctl'));
    },
  };

  return ok(client);
}
