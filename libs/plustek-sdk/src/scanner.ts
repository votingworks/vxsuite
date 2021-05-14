import { err, ok, Result, safeParse } from '@votingworks/types'
import { parseScannerError, ScannerError } from './errors'
import { PaperStatus, PaperStatusSchema } from './paper-status'
import { findBinaryPath } from './plustekctl'
import { spawn } from 'child_process'
import { createInterface } from 'readline'
import deferred from './util/deferred'
import { Config, DEFAULT_CONFIG } from './config'
import { file as createTempFile, dir as createTempDir } from './util/temp'
import makeDebug from 'debug'
import sleep from './util/sleep'

const debug = makeDebug('plustek-sdk:scanner')

const CLI_DELIMITER = '<<<>>>'

export interface ScannerClientCallbacks {
  onConfigResolved?(config: Config): void
  onError?(error: Error): void
  onConnecting?(): void
  onWaitingForHandshake?(): void
  onConnected?(): void
  onDisconnected?(): void
}

export type GetPaperStatusResult = Result<PaperStatus, ScannerError | Error>
export type ScanResult = Result<{ files: string[] }, ScannerError | Error>
export type AcceptResult = Result<void, ScannerError | Error>
export type RejectResult = Result<void, ScannerError | Error>
export type CloseResult = Result<void, ScannerError | Error>

export interface ScannerClient {
  isConnected(): boolean
  getPaperStatus(): Promise<GetPaperStatusResult>
  waitForStatus(options: {
    status: PaperStatus
    timeout?: number
    interval?: number
  }): Promise<GetPaperStatusResult | undefined>
  scan(): Promise<ScanResult>
  accept(): Promise<AcceptResult>
  reject(options: { hold: boolean }): Promise<RejectResult>
  close(): Promise<CloseResult>
}

interface IpcHandlers<T> {
  ok?(resolve: (value: T) => void): void
  data?(data: string, resolve: (value: T) => void): void
  error(error: ScannerError | Error, resolve: (value: T) => void): void
  else(line: string, resolve: (value: T) => void): void
}

const noop = () => {
  // do nothing
}

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
  const plustekctlResult = await findBinaryPath()

  if (plustekctlResult.isErr()) {
    const error = new Error('unable to find plustekctl')
    onError(error)
    return err(error)
  }

  const resolvedConfig: Config = {
    ...config,
    savepath: config.savepath ?? (await createTempDir()),
  }
  debug('opening scanner with config: %o', resolvedConfig)
  onConfigResolved(resolvedConfig)
  const configFilePath = await createTempFile(
    JSON.stringify(resolvedConfig, undefined, 2)
  )
  const args = ['--config', configFilePath, '--delimiter', CLI_DELIMITER]
  const plustekctlPath = plustekctlResult.unwrap()
  debug('spawning: %s %o', plustekctlPath, args)
  const plustekctl = spawn(plustekctlPath, args, { stdio: 'pipe' })

  const {
    promise: connectedPromise,
    resolve: connectedResolve,
  } = deferred<void>()
  let setupError: Error | undefined
  let connected = false
  let interpreting = false
  let quitting = false
  let currentLineHandler: ((line: string) => void) | undefined
  let currentIPCPromise = Promise.resolve()

  /* istanbul ignore next */
  createInterface(plustekctl.stderr).on('line', (line) => {
    debug('stderr: %s', line)
  })

  plustekctl
    .on('error', (error) => {
      setupError = new Error(`connection error: ${error}`)
      onError(setupError)
    })
    .on('exit', (code, signal) => {
      if (quitting && code === 0) {
        connected = false
        onDisconnected()
      } else {
        setupError = new Error(
          `connection error: ${plustekctlPath} exited unexpectedly (code=${code}, signal=${signal})`
        )
        onError(setupError)
        connected = false
      }
    })

  onConnecting()

  if (setupError) {
    return err(setupError)
  }

  const lines = createInterface(plustekctl.stdout)

  lines.on('line', (line) => {
    debug('← %s', line)
    if (line === CLI_DELIMITER) {
      interpreting = !interpreting
    } else if (interpreting) {
      /* istanbul ignore else */
      if (line === 'ready') {
        if (!connected) {
          connected = true
          connectedResolve()
          onConnected()
        }
      } else if (currentLineHandler) {
        currentLineHandler(line)
      } else {
        debug('no registered IPC handling response line: %s', line)
      }
    }
  })

  async function doIPC<T>(
    method: string,
    handlers: IpcHandlers<T>
  ): Promise<T> {
    debug('doIPC BEGIN (method=%s)', method)
    const { promise, resolve } = deferred<T>()

    // Build an IPC queue
    const previousIPCPromise = currentIPCPromise
    currentIPCPromise = promise.then()
    await previousIPCPromise

    if (!connected) {
      handlers.error(new Error('client is disconnected'), resolve)
    }

    currentLineHandler = (line) => {
      const match = line.trim().match(/^([^\s:]+):\s*(err=)?(.*)$/)

      if (match) {
        const [, responder, isError, data] = match as [
          string,
          string,
          string,
          string
        ]

        if (responder !== method) {
          handlers.else(line, resolve)
        } else if (isError) {
          handlers.error(parseScannerError(data), resolve)
        } else if (handlers.ok && data === 'ok') {
          handlers.ok(resolve)
        } else if (handlers.data) {
          handlers.data(data, resolve)
        } else {
          handlers.else(line, resolve)
        }
      } else {
        handlers.else(line, resolve)
      }
    }

    debug('→ %s', method)
    plustekctl.stdin.write(method)
    plustekctl.stdin.write('\n')

    try {
      return await promise
    } finally {
      currentLineHandler = undefined
      debug('doIPC END (method=%s)', method)
    }
  }

  onWaitingForHandshake()

  /* istanbul ignore next - unsure how to test this case */
  if (setupError) {
    return err(setupError)
  }

  await connectedPromise

  const getPaperStatus: ScannerClient['getPaperStatus'] = () =>
    doIPC('get-paper-status', {
      data: (data, resolve) => resolve(safeParse(PaperStatusSchema, data)),
      error: (error, resolve) => resolve(err(error)),
      else: (line, resolve) =>
        resolve(err(new Error(`invalid response: ${line}`))),
    })

  return ok({
    isConnected: () => connected,

    getPaperStatus,

    waitForStatus: async ({ status, interval = 50, timeout }) => {
      const until =
        typeof timeout === 'undefined' ? Infinity : Date.now() + timeout
      let result: GetPaperStatusResult | undefined

      while (Date.now() < until) {
        result = await getPaperStatus()
        if (result.ok() === status) {
          break
        }

        await sleep(interval)
      }

      return result
    },

    scan: () => {
      const files: string[] = []
      return doIPC('scan', {
        data: (data, resolve) => {
          const match = data.match(/^file=(.+)$/)

          if (match) {
            files.push(match[1] as string)
          } else {
            resolve(err(new Error(`unexpected response data: ${data}`)))
          }
        },
        ok: (resolve) => resolve(ok({ files })),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(err(new Error(`invalid response: ${line}`))),
      })
    },

    accept: () =>
      doIPC('accept', {
        ok: (resolve) => resolve(ok(undefined)),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(err(new Error(`invalid response: ${line}`))),
      }),

    reject: ({ hold }) =>
      doIPC(hold ? 'reject-hold' : 'reject', {
        ok: (resolve) => resolve(ok(undefined)),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(err(new Error(`invalid response: ${line}`))),
      }),

    close: () => {
      quitting = true
      return doIPC('quit', {
        ok: (resolve) => resolve(ok(undefined)),
        error: (error, resolve) => resolve(err(error)),
        else: (line, resolve) =>
          resolve(err(new Error(`invalid response: ${line}`))),
      })
    },
  })
}
