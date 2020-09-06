import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { Readable, Writable } from 'stream'
import { Importer } from '../../src/importer'
import { Interpreter } from '../../src/interpreter'
import { Scanner } from '../../src/scanner'
import { SheetOf } from '../../src/types'

export function makeMockInterpreter(): jest.Mocked<Interpreter> {
  return {
    addHmpbTemplate: jest.fn(),
    interpretFile: jest.fn(),
    setTestMode: jest.fn(),
    electionDidChange: jest.fn(),
  }
}

export function makeMockImporter(): jest.Mocked<Importer> {
  return {
    addHmpbTemplates: jest.fn(),
    configure: jest.fn(),
    doExport: jest.fn(),
    startImport: jest.fn(),
    continueImport: jest.fn(),
    waitForEndOfBatchOrScanningPause: jest.fn(),
    importFile: jest.fn(),
    doZero: jest.fn(),
    getStatus: jest.fn(),
    restoreConfig: jest.fn(),
    setTestMode: jest.fn(),
    unconfigure: jest.fn(),
  }
}

type ScanSessionStep =
  | { type: 'sheet'; sheet: SheetOf<string> }
  | { type: 'error'; error: Error }

/**
 * Represents a scanner session, but doesn't actually run anything.
 */
class ScannerSessionPlan {
  #steps: ScanSessionStep[] = []
  #ended = false

  public get steps(): readonly ScanSessionStep[] {
    return this.#steps
  }

  /**
   * Adds a scanning step to the session.
   */
  public sheet(sheet: SheetOf<string>): this {
    if (this.#ended) {
      throw new Error('cannot add a sheet scan step to an ended session')
    }
    this.#steps.push({ type: 'sheet', sheet })
    return this
  }

  /**
   * Adds an error step to the session.
   */
  public error(error: Error): this {
    if (this.#ended) {
      throw new Error('cannot add an error step to an ended session')
    }
    this.#steps.push({ type: 'error', error })
    return this
  }

  public end(): void {
    this.#ended = true
  }

  *[Symbol.iterator](): IterableIterator<ScanSessionStep> {
    if (!this.#ended) {
      throw new Error(
        'session has not been ended; please call `session.end()` before using it'
      )
    }

    yield* this.#steps
  }
}

export interface MockScanner extends Scanner {
  withNextScannerSession(): ScannerSessionPlan
}

/**
 * Makes a mock scanner where you can define your own sessions.
 *
 * @example
 *
 * const scanner = makeMockScanner()
 * scanner.withNextScannerSession()
 *   .scan('/path/to/image01.png')
 *   .scan('/path/to/image02.png')
 *   .end()
 *
 * // do something to trigger a scan
 */
export function makeMockScanner(): MockScanner {
  let nextScannerSession: ScannerSessionPlan | undefined

  return {
    async *scanSheets(): AsyncGenerator<SheetOf<string>> {
      const session = nextScannerSession
      nextScannerSession = undefined

      if (!session) {
        throw new Error(
          'no session registered; call scanner.withNextScannerSession() to define the next session'
        )
      }

      for (const step of session) {
        switch (step.type) {
          case 'sheet':
            yield step.sheet
            break

          case 'error':
            throw step.error
        }
      }
    },

    /**
     * Gets the next scanner session to be used when `scanSheets` is called.
     */
    withNextScannerSession(): ScannerSessionPlan {
      if (!nextScannerSession) {
        nextScannerSession = new ScannerSessionPlan()
      }
      return nextScannerSession
    },
  }
}

export interface MockReadable extends Readable {
  append(chunk: string): void
}

export interface MockWritable extends Writable {
  writes: readonly { chunk: unknown; encoding?: string }[]
}

/**
 * Makes a mock readable stream.
 */
export function makeMockReadable(): MockReadable {
  const readable = new EventEmitter() as MockReadable
  let buffer: string | undefined
  readable.append = jest.fn((chunk): void => {
    buffer = (buffer ?? '') + chunk
    readable.emit('readable')
  })
  readable.read = jest.fn((size): unknown => {
    if (typeof buffer === 'string') {
      const readSize = size ?? buffer.length
      const result = buffer.slice(0, readSize)
      buffer = buffer.length <= readSize ? undefined : buffer.slice(readSize)
      return result
    } else {
      return undefined
    }
  })
  return readable
}

/**
 * Makes a mock writable stream.
 */
export function makeMockWritable(): MockWritable {
  const writable = new EventEmitter() as MockWritable
  const writes: { chunk: unknown; encoding?: string }[] = []

  writable.writes = writes
  writable.write = jest.fn((...args: unknown[]): boolean => {
    let chunk: unknown
    let encoding: unknown
    let callback: unknown

    if (args.length === 3) {
      ;[chunk, encoding, callback] = args
    } else if (args.length === 2) {
      ;[chunk, callback] = args
    } else {
      ;[callback] = args
    }

    if (typeof encoding !== 'undefined' && typeof encoding !== 'string') {
      throw new TypeError('encoding expected to be a string')
    }

    if (typeof chunk !== 'undefined') {
      writes.push({ chunk, encoding })
    }

    process.nextTick(() => {
      if (typeof callback === 'function') {
        callback()
      }
    })

    return true
  })

  writable.end = jest.fn((...args: unknown[]): void => {
    let chunk: unknown
    let encoding: unknown
    let callback: unknown

    if (args.length === 3) {
      ;[chunk, encoding, callback] = args
    } else if (args.length === 2) {
      ;[chunk, callback] = args
    } else {
      ;[callback] = args
    }

    if (typeof encoding !== 'undefined' && typeof encoding !== 'string') {
      throw new TypeError('encoding expected to be a string')
    }

    if (typeof chunk !== 'undefined') {
      writes.push({ chunk, encoding })
    }

    process.nextTick(() => {
      if (typeof callback === 'function') {
        callback()
      }
    })
  })

  return writable
}

export interface MockChildProcess extends ChildProcess {
  stdout: MockReadable
  stderr: MockReadable
}

/**
 * Creates a mock child process with mock streams.
 */
export function makeMockChildProcess(): MockChildProcess {
  const result: Partial<ChildProcess> = {
    pid: Math.floor(Math.random() * 10_000),
    stdin: makeMockWritable(),
    stdout: makeMockReadable(),
    stderr: makeMockReadable(),
  }

  return Object.assign(new EventEmitter(), result) as MockChildProcess
}
