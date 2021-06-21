import { err, ok, Result } from '@votingworks/types'
import { sleep } from '@votingworks/utils'
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

const debug = makeDebug('plustek-sdk:mock-client')

export enum Errors {
  DuplicateLoad = 'DuplicateLoad',
  Unresponsive = 'Unresponsive',
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
  private unresponsive = false
  private frontSheet?: readonly string[]
  private backSheet?: readonly string[]
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
  public async simulateLoadSheet(
    files: readonly string[]
  ): Promise<Result<void, Errors>> {
    debug('manualLoad files=%o', files)

    if (this.unresponsive) {
      debug('cannot load, scanner unresponsive')
      return err(Errors.Unresponsive)
    }

    if (!this.connected) {
      debug('cannot load, not connected')
      return err(Errors.NotConnected)
    }

    if (this.frontSheet) {
      debug('cannot load, already loaded')
      return err(Errors.DuplicateLoad)
    }

    await sleep(this.toggleHoldDuration)
    this.frontSheet = files
    debug('manualLoad success')
    return ok()
  }

  /**
   * Removes a loaded sheet if present.
   */
  public async simulateRemoveSheet(): Promise<Result<void, Errors>> {
    debug('manualRemove')

    if (this.unresponsive) {
      debug('cannot remove, scanner unresponsive')
      return err(Errors.Unresponsive)
    }

    if (!this.connected) {
      debug('cannot remove, not connected')
      return err(Errors.NotConnected)
    }

    if (!this.frontSheet) {
      debug('cannot remove, no paper')
      return err(Errors.NoPaperToRemove)
    }

    delete this.frontSheet
    debug('manualRemove success')
    return ok()
  }

  /**
   * Simulates an unresponsive scanner, i.e. the once-connected scanner had its
   * cable removed or power turned off. Once a scanner is unresponsive it cannot
   * become responsive again, and a new client/connection must be established.
   */
  public async simulateUnresponsive(): Promise<void> {
    this.unresponsive = true
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

    if (this.unresponsive) {
      debug('cannot get paper status, scanner unresponsive')
      return err(ScannerError.SaneStatusIoError)
    }

    if (!this.connected) {
      debug('cannot get paper status, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.frontSheet && !this.backSheet) {
      debug('nothing loaded')
      return ok(PaperStatus.VtmDevReadyNoPaper)
    }

    if (this.frontSheet && !this.backSheet) {
      debug('only front has paper')
      return ok(PaperStatus.VtmReadyToScan)
    }

    if (!this.frontSheet && this.backSheet) {
      debug('only back has paper')
      return ok(PaperStatus.VtmReadyToEject)
    }

    debug('front and back both have paper')
    return ok(PaperStatus.VtmBothSideHavePaper)
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

    if (this.unresponsive) {
      debug('cannot wait for status, scanner unresponsive')
      return err(ScannerError.SaneStatusIoError)
    }

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

    if (this.unresponsive) {
      debug('cannot scan, scanner unresponsive')
      return err(ScannerError.PaperStatusErrorFeeding)
    }

    if (!this.connected) {
      debug('cannot scan, not connected')
      return err(ScannerError.NoDevices)
    }

    if (!this.frontSheet && this.backSheet) {
      debug('cannot scan, paper is held at back')
      return err(ScannerError.VtmPsReadyToEject)
    }

    if (!this.frontSheet && !this.backSheet) {
      debug('cannot scan, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.frontSheet && this.backSheet) {
      debug('cannot scan, both sides have paper')
      return err(ScannerError.VtmBothSideHavePaper)
    }

    await sleep(this.passthroughDuration)
    this.backSheet = this.frontSheet!
    delete this.frontSheet
    debug('scanned files=%o', this.backSheet)
    return ok({ files: this.backSheet.slice() })
  }

  /**
   * Accepts the currently-loaded sheet if any.
   */
  public async accept(): Promise<AcceptResult> {
    debug('accept')

    if (this.unresponsive) {
      debug('cannot accept, scanner unresponsive')
      return err(ScannerError.SaneStatusIoError)
    }

    if (!this.connected) {
      debug('cannot accept, not connected')
      return err(ScannerError.NoDevices)
    }

    if (this.frontSheet && this.backSheet) {
      debug('cannot accept, both sides have paper')
      return err(ScannerError.VtmBothSideHavePaper)
    }

    if (!this.frontSheet && !this.backSheet) {
      debug('cannot accept, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.frontSheet) {
      await sleep(this.passthroughDuration)
    } else {
      await sleep(this.toggleHoldDuration)
    }

    delete this.frontSheet
    delete this.backSheet
    debug('accept success')
    return ok()
  }

  /**
   * Rejects and optionally holds the currently-loaded sheet if any.
   */
  public async reject({ hold }: { hold: boolean }): Promise<RejectResult> {
    debug('reject hold=%s', hold)

    if (this.unresponsive) {
      debug('cannot reject, scanner unresponsive')
      return err(ScannerError.SaneStatusIoError)
    }

    if (!this.connected) {
      debug('cannot reject, not connected')
      return err(ScannerError.NoDevices)
    }

    if (this.frontSheet && this.backSheet) {
      debug('cannot reject, both sides have paper')
      return err(ScannerError.VtmBothSideHavePaper)
    }

    if (!this.frontSheet && !this.backSheet) {
      debug('cannot reject, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (this.frontSheet) {
      await sleep(this.passthroughDuration)
    } else {
      await sleep(this.toggleHoldDuration)
    }

    if (hold) {
      this.frontSheet = this.backSheet ?? this.frontSheet
      delete this.backSheet
    } else {
      delete this.frontSheet
      delete this.backSheet
    }

    debug('reject success')
    return ok()
  }

  public async calibrate(): Promise<CalibrateResult> {
    debug('calibrate')

    if (this.unresponsive) {
      debug('cannot calibrate, scanner unresponsive')
      return err(ScannerError.SaneStatusIoError)
    }

    if (!this.connected) {
      debug('cannot reject, not connected')
      return err(ScannerError.NoDevices)
    }

    if (this.frontSheet && this.backSheet) {
      debug('cannot calibrate, both sides have paper')
      return err(ScannerError.VtmBothSideHavePaper)
    }

    if (!this.frontSheet && !this.backSheet) {
      debug('cannot calibrate, no paper')
      return err(ScannerError.VtmPsDevReadyNoPaper)
    }

    if (!this.frontSheet && this.backSheet) {
      debug('cannot calibrate, paper held at back')
      return err(ScannerError.SaneStatusNoDocs)
    }

    await sleep(this.passthroughDuration * 3)
    delete this.frontSheet
    delete this.backSheet
    debug('calibrate success')
    return ok()
  }

  /**
   * Closes the connection to the mock scanner.
   */
  public async close(): Promise<CloseResult> {
    debug('close')
    this.connected = false
    return ok()
  }
}
