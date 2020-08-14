import { Importer } from '../../src/importer'
import { Interpreter } from '../../src/interpreter'
import { Scanner, ScanIntoOptions } from '../../src/scanner'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

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
    waitForImports: jest.fn(),
    doZero: jest.fn(),
    getStatus: jest.fn(),
    restoreConfig: jest.fn(),
    setTestMode: jest.fn(),
    unconfigure: jest.fn(),
  }
}

type ScanSessionStep =
  | { type: 'scan'; path: string }
  | { type: 'error'; error: Error }

/**
 * Represents a scanner session, but doesn't actually run anything.
 */
class ScannerSession {
  private steps: ScanSessionStep[] = []
  private ended = false

  /**
   * Adds a scanning step to the session.
   */
  public scan(path: string): this {
    if (this.ended) {
      throw new Error('cannot add a scan step to an ended session')
    }
    this.steps.push({ type: 'scan', path })
    return this
  }

  /**
   * Adds an error step to the session.
   */
  public error(error: Error): this {
    if (this.ended) {
      throw new Error('cannot add an error step to an ended session')
    }
    this.steps.push({ type: 'error', error })
    return this
  }

  public end(): void {
    this.ended = true
  }

  *[Symbol.iterator](): IterableIterator<ScanSessionStep> {
    if (!this.ended) {
      throw new Error(
        'session has not been ended; please call `session.end()` before using it'
      )
    }

    yield* this.steps
  }
}

export interface MockScanner extends Scanner {
  withNextScannerSession(): ScannerSession
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
  let nextScannerSession: ScannerSession | undefined

  return {
    async scanInto(options: ScanIntoOptions): Promise<void> {
      const session = nextScannerSession
      nextScannerSession = undefined

      if (!session) {
        throw new Error(
          'no session registered; call scanner.withNextScannerSession() to define the next session'
        )
      }

      for (const step of session) {
        if (step.type === 'scan') {
          await options.onFileScanned?.(step.path)
        } else if (step.type === 'error') {
          throw step.error
        }
      }
    },

    /**
     * Gets the next scanner session to be used when `scanInto` is called.
     */
    withNextScannerSession(): ScannerSession {
      if (!nextScannerSession) {
        nextScannerSession = new ScannerSession()
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
    if (typeof size !== 'number') {
      return buffer
    }

    if (typeof buffer === 'string') {
      const result = buffer.slice(0, size)
      buffer = buffer.length <= size ? undefined : buffer.slice(size)
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
