import { err, ok, Result } from '@votingworks/types'
import makeDebug from 'debug'
import { ScannerError } from './errors'
import { PaperStatus } from './paper-status'
import {
  AcceptResult,
  CalibrateResult,
  CloseResult,
  GetPaperStatusResult,
  RejectResult,
  ScannerClient,
  ScanResult
} from './scanner'
import sleep from './util/sleep'

const debug = makeDebug('plustek-sdk:mock-client')

export enum Errors {
  DuplicateLoad = 'DuplicateLoad',
  NotConnected = 'NotConnected',
  NoPaperToRemove = 'NoPaperToRemove',
}

export interface Options {
  /**
   * How long does it take to take or release a paper hold forward or backward?
   */
  toggleHoldDuration?: number

  /**
   * How long does it take to pass a sheet through the scanner forward or
   * backward?
   */
  passthroughDuration?: number
}

/**
 * Provides a mock `ScannerClient` that acts like the plustek VTM 300.
 */
export class MockScannerClient implements ScannerClient {
  private connected = false
  private loaded?: readonly string[]
  private loadedAt?: 'front' | 'back'
  private toggleHoldDuration: number
  private passthroughDuration: number

  public constructor({
    toggleHoldDuration = 100,
    passthroughDuration = 1000,
  }: Options = {}) {
    this.toggleHoldDuration = toggleHoldDuration
    this.passthroughDuration = passthroughDuration
  }

  /**
   * "Connects" to the mock scanner, must be called before other interactions.
   */
  public async connect(): Promise<void> {
    debug('connecting')
    this.connected = true
  }

  /**
   * "Disconnects" from the mock scanner.
   */
  public async disconnect(): Promise<void> {
    debug('disconnecting')
    this.connected = false
  }

  /**
   * Loads a sheet with scan images from `files`.
   */
  public async manualLoad(
    files: readonly string[]
  ): Promise<Result<void, Errors>> {
    debug('manualLoad files=%o', files)

    if (!this.connected) {
      debug('cannot load, not connected')
      return err(Errors.NotConnected)
    }

    if (this.loaded) {
      debug('cannot load, already loaded')
      return err(Errors.DuplicateLoad)
    }

    await sleep(this.toggleHoldDuration)
    this.loaded = files
    this.loadedAt = 'front'
    debug('manualLoad success')
    return ok(undefined)
  }

  /**
   * Removes a loaded sheet if present.
   */
  public async manualRemove(): Promise<Result<void, Errors>> {
    debug('manualRemove')

    if (!this.connected) {
      debug('cannot remove, not connected')
      return err(Errors.NotConnected)
    }

    if (!this.loaded) {
      debug('cannot remove, no paper')
      return err(Errors.NoPaperToRemove)
    }

    delete this.loaded
    delete this.loadedAt
    debug('manualRemove success')
    return ok(undefined)
  }

  /**
   * Determines whether the client is connected.
   */
  public isConnected(): boolean {
    return this.connected
  }

  /**
   * Gets the current paper status.
   */
  public async getPaperStatus(): Promise<GetPaperStatusResult> {
    debug('getPaperStatus')

    if (!this.connected) {
      debug('cannot get paper status, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.loaded) {
      debug('nothing loaded')
      return ok(PaperStatus.VtmDevReadyNoPaper)
    }

    debug('paper is loaded at %s', this.loadedAt)
    if (this.loadedAt === 'front') {
      return ok(PaperStatus.VtmReadyToScan)
    } else {
      return ok(PaperStatus.VtmReadyToEject)
    }
  }

  /**
   * Waits for a given `status` up to `timeout` milliseconds, checking every
   * `interval` milliseconds.
   */
  public async waitForStatus({
    status,
    interval = 50,
    timeout,
  }: {
    status: PaperStatus
    timeout?: number | undefined
    interval?: number | undefined
  }): Promise<GetPaperStatusResult | undefined> {
    debug('waitForStatus')

    if (!this.connected) {
      debug('cannot wait for status, not connected')
      return err(ScannerError.NoDevices)
    }

    let result: GetPaperStatusResult | undefined
    const until = typeof timeout === 'number' ? Date.now() + timeout : Infinity

    while (Date.now() < until) {
      result = await this.getPaperStatus()
      /* istanbul ignore next */
      debug('got paper status: %s', result.ok() ?? result.err())
      if (result.ok() === status) {
        break
      }

      await sleep(Math.min(interval, until - Date.now()))
    }

      /* istanbul ignore next */
    debug('final paper status: %s', result?.ok() ?? result?.err())
    return result
  }

  /**
   * Scans the currently-loaded sheet if any is present.
   */
  public async scan(): Promise<ScanResult> {
    debug('scan')

    if (!this.connected) {
      debug('cannot scan, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.loaded) {
      debug('cannot scan, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.loadedAt === 'back') {
      debug('cannot scan, paper is held at back')
      return err(ScannerError.VtmPsReadyToEject)
    }

    await sleep(this.passthroughDuration)
    this.loadedAt = 'back'
    debug('scanned files=%o', this.loaded)
    return ok({ files: this.loaded.slice() })
  }

  /**
   * Accepts the currently-loaded sheet if any.
   */
  public async accept(): Promise<AcceptResult> {
    debug('accept')

    if (!this.connected) {
      debug('cannot accept, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.loaded) {
      debug('cannot accept, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.loadedAt === 'front') {
      await sleep(this.passthroughDuration)
    } else {
      await sleep(this.toggleHoldDuration)
    }

    delete this.loaded
    delete this.loadedAt
    debug('accept success')
    return ok(undefined)
  }

  /**
   * Rejects and optionally holds the currently-loaded sheet if any.
   */
  public async reject({ hold }: { hold: boolean }): Promise<RejectResult> {
    debug('reject hold=%s', hold)

    if (!this.connected) {
      debug('cannot reject, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.loaded) {
      debug('cannot reject, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.loadedAt === 'back') {
      await sleep(this.passthroughDuration)
    } else {
      await sleep(this.toggleHoldDuration)
    }

    if (hold) {
      this.loadedAt = 'front'
    } else {
      delete this.loaded
      delete this.loadedAt
    }

    debug('reject success')
    return ok(undefined)
  }

  public async calibrate(): Promise<CalibrateResult> {
    debug('calibrate')

    if (!this.connected) {
      debug('cannot reject, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.loaded) {
      debug('cannot calibrate, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.loadedAt === 'back') {
      debug('cannot calibrate, paper held at back')
      return err(ScannerError.SaneStatusNoDocs)
    }

    await sleep(this.passthroughDuration * 3)
    delete this.loaded
    delete this.loadedAt
    debug('calibrate success')
    return ok(undefined)
  }

  /**
   * Closes the connection to the mock scanner.
   */
  public async close(): Promise<CloseResult> {
    debug('close')
    this.connected = false
    return ok(undefined)
  }
}
