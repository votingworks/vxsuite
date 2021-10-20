/* eslint-disable max-classes-per-file */
import { err, ok, Result, safeParse } from '@votingworks/types';
import { deferred, sleep, throwIllegalValue } from '@votingworks/utils';
import { spawn } from 'child_process';
import makeDebug from 'debug';
import { createInterface } from 'readline';
import { Config, DEFAULT_CONFIG } from './config';
import { parseScannerError, ScannerError } from './errors';
import { PaperStatus, PaperStatusSchema } from './paper-status';
import { findBinaryPath } from './plustekctl';
import { dir as createTempDir, file as createTempFile } from './util/temp';

const debug = makeDebug('plustek-sdk:scanner');

const CLI_DELIMITER = '<<<>>>';

export class ClientError extends Error {}
export class PlustekctlBinaryMissingError extends ClientError {}
export class ClientDisconnectedError extends ClientError {}
export class InvalidClientResponseError extends ClientError {}

export interface ScannerClientCallbacks {
  onConfigResolved?(config: Config): void;
  onError?(error: Error): void;
  onConnecting?(): void;
  onWaitingForHandshake?(): void;
  onConnected?(): void;
  onDisconnected?(): void;
}

export type GetPaperStatusResult = Result<PaperStatus, ScannerError | Error>;
export type ScanResult = Result<{ files: string[] }, ScannerError | Error>;
export type AcceptResult = Result<void, ScannerError | Error>;
export type RejectResult = Result<void, ScannerError | Error>;
export type CalibrateResult = Result<void, ScannerError | Error>;
export type CloseResult = Result<void, ScannerError | Error>;

export type ScanRetryPredicate = (result: ScanResult) => boolean;

export interface ScannerClient {
  isConnected(): boolean;
  getPaperStatus(): Promise<GetPaperStatusResult>;
  waitForStatus(options: {
    status: PaperStatus;
    timeout?: number;
    interval?: number;
  }): Promise<GetPaperStatusResult | undefined>;
  scan(options?: {
    onScanAttemptStart?(attempt: number): void;
    onScanAttemptEnd?(attempt: number, result: ScanResult): void;
    shouldRetry?: ScanRetryPredicate;
  }): Promise<ScanResult>;
  accept(): Promise<AcceptResult>;
  reject(options: { hold: boolean }): Promise<RejectResult>;
  calibrate(): Promise<CalibrateResult>;
  close(): Promise<CloseResult>;
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
  const plustekctlResult = await findBinaryPath();

  if (plustekctlResult.isErr()) {
    const error = new PlustekctlBinaryMissingError();
    onError(error);
    return err(error);
  }

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
  const plustekctlPath = plustekctlResult.ok();
  debug('spawning: %s %o', plustekctlPath, args);
  const plustekctl = spawn(plustekctlPath, args, { stdio: 'pipe' });
  const clientDebug = makeDebug(
    `${debug.namespace}:client(pid=${plustekctl.pid})`
  );
  clientDebug('spawned %s', plustekctlPath);

  const {
    promise: connectedPromise,
    resolve: connectedResolve,
  } = deferred<void>();
  const { promise: exitPromise, resolve: exitResolve } = deferred<void>();
  let setupError: Error | undefined;
  let connected = false;
  let interpreting = false;
  let quitting = false;
  let currentEventHandler: ((event: PlustekEvent) => void) | undefined;
  let currentIPCPromise = Promise.resolve();

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

  async function doIPC<T>(
    method: string,
    handlers: IpcHandlers<T>
  ): Promise<T> {
    clientDebug('doIPC BEGIN (method=%s)', method);
    const { promise, resolve } = deferred<T>();

    // Build an IPC queue
    const previousIPCPromise = currentIPCPromise;
    currentIPCPromise = promise.then();
    await previousIPCPromise;

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
    doIPC('get-paper-status', {
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

    waitForStatus: async ({ status, interval = 50, timeout }) => {
      const until =
        typeof timeout === 'undefined' ? Infinity : Date.now() + timeout;
      let result: GetPaperStatusResult | undefined;

      while (Date.now() < until) {
        result = await getPaperStatus();
        if (result.ok() === status) {
          break;
        }

        await sleep(interval);
      }

      return result;
    },

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
        const resultPromise = doIPC<ScanResult>('scan', {
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
          ok: (resolve) => resolve(ok({ files })),
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
      doIPC('accept', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      }),

    reject: ({ hold }) =>
      doIPC(hold ? 'reject-hold' : 'reject', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      }),

    calibrate: () =>
      doIPC('calibrate', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      }),

    close: () => {
      quitting = true;
      return doIPC('quit', {
        ok: (resolve) => resolve(ok()),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(
            err(new InvalidClientResponseError(`invalid response: ${line}`))
          ),
      });
    },
  };

  return ok(client);
}
