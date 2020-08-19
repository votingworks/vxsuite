import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { Importer } from '../../src/importer'
import { Interpreter } from '../../src/interpreter'
import { Scanner, Sheet } from '../../src/scanner'

export function makeMockInterpreter(): jest.Mocked<Interpreter> {
  return {
    addHmpbTemplate: jest.fn(),
    interpretFile: jest.fn(),
    setTestMode: jest.fn(),
  }
}

export function makeMockImporter(): jest.Mocked<Importer> {
  return {
    addHmpbTemplates: jest.fn(),
    addManualBallot: jest.fn(),
    configure: jest.fn(),
    doExport: jest.fn(),
    doImport: jest.fn(),
    importFile: jest.fn(),
    doZero: jest.fn(),
    getStatus: jest.fn(),
    restoreConfig: jest.fn(),
    setTestMode: jest.fn(),
    unconfigure: jest.fn(),
  }
}

type ScanSessionStep =
  | { type: 'sheet'; sheet: Sheet }
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
  public sheet(sheet: Sheet): this {
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
    async *scanSheets(): AsyncGenerator<Sheet> {
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

/**
 * Makes a mock readable stream.
 */
export function makeMockReadable(): MockReadable {
  const readable = new EventEmitter() as MockReadable
  let buffer: string | undefined
  readable.append = (chunk): void => {
    buffer = (buffer ?? '') + chunk
    readable.emit('readable')
  }
  readable.read = (size): unknown => {
    if (typeof buffer === 'string') {
      const readSize = size ?? buffer.length
      const result = buffer.slice(0, readSize)
      buffer = buffer.length <= readSize ? undefined : buffer.slice(readSize)
      return result
    } else {
      return undefined
    }
  }
  return readable
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
    stdout: makeMockReadable(),
    stderr: makeMockReadable(),
  }

  return Object.assign(new EventEmitter(), result) as MockChildProcess
}
