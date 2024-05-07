import { Optional, Result, assert, err, ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { print } from './printing';
import {
  FujitsuThermalPrinterDriver,
  FujitsuThermalPrinterDriverInterface,
  getDevice,
} from './driver';
import { rootDebug } from './debug';
import { IDLE_REPLY_PARAMETER, LINE_FEED_REPLY_PARAMETER } from './globals';
import {
  PrinterStatus,
  summarizeRawStatus,
  waitForPrintReadyStatus,
} from './status';

const debug = rootDebug.extend('printer');

// the mechanism by default runs at 8cm/s, so this is a generous, 2x estimate
const WAIT_FOR_ADVANCE_APPEAR_PER_CM_MS = 250;

export type PrintResult = Result<void, PrinterStatus>;

export interface FujitsuThermalPrinterInterface {
  getStatus(): Promise<PrinterStatus>;
  print(data: Uint8Array): Promise<PrintResult>;
  advancePaper(lineFeedCount: number): Promise<PrintResult>;
}

export class FujitsuThermalPrinter implements FujitsuThermalPrinterInterface {
  private driver?: FujitsuThermalPrinterDriverInterface;

  private async getDriver(): Promise<
    Optional<FujitsuThermalPrinterDriverInterface>
  > {
    if (this.driver) return this.driver;

    const device = await getDevice();
    if (!device) {
      // the device is not attached or there is an access issue
      return;
    }

    const driver = new FujitsuThermalPrinterDriver(device);
    await driver.connect();

    // standardize the printer config state
    await driver.resetPrinter();
    await driver.setReplyParameter(IDLE_REPLY_PARAMETER);

    return driver;
  }

  /**
   * Gets a the status of the printer. Handles device connection and
   * disconnection. All other printer methods should check status via this
   * method to ensure the printer is connected.
   */
  async getStatus(): Promise<PrinterStatus> {
    this.driver = await this.getDriver();
    if (!this.driver) {
      return { state: 'error', type: 'disconnected' };
    }

    try {
      const status = await this.driver.getStatus();
      return summarizeRawStatus(status);
    } catch {
      // when a previously responsive driver fails to return a response, it is
      // most likely that the device was disconnected
      this.driver = undefined;
      return { state: 'error', type: 'disconnected' };
    }
  }

  async advancePaper(
    millimeters: number
  ): Promise<Result<void, PrinterStatus>> {
    const initialStatus = await this.getStatus();
    if (initialStatus.state !== 'idle') {
      debug(`advance paper command ignored because printer is not idle`);
      return err(initialStatus);
    }
    assert(this.driver);

    await this.driver.setReplyParameter(LINE_FEED_REPLY_PARAMETER);
    let dotLinesRemaining = millimeters * 8;
    while (dotLinesRemaining > 0) {
      const dotLines = Math.min(dotLinesRemaining, 255);
      await this.driver.feedForward(dotLines);
      dotLinesRemaining -= dotLines;
    }
    await this.driver.setReplyParameter(IDLE_REPLY_PARAMETER);
    const result = await waitForPrintReadyStatus(this.driver, {
      interval: 100,
      timeout: (millimeters / 10) * WAIT_FOR_ADVANCE_APPEAR_PER_CM_MS,
      replyParameter: IDLE_REPLY_PARAMETER,
    });

    if (result.isErr()) {
      debug(`advance paper failed on status: ${JSON.stringify(result.err())}`);
      await this.driver.setReplyParameter(IDLE_REPLY_PARAMETER);
      return err(summarizeRawStatus(result.err()));
    }
    debug(`advanced paper ${millimeters} millimeters`);
    return ok();
  }

  async print(data: Buffer): Promise<Result<void, PrinterStatus>> {
    const initialStatus = await this.getStatus();
    if (initialStatus.state !== 'idle') {
      debug(`print command ignored because printer is not idle`);
      return err(initialStatus);
    }
    assert(this.driver);

    const printResult = await print(this.driver, data);
    if (printResult.isErr()) {
      debug(`print failed on status: ${JSON.stringify(printResult.err())}`);
      return err(summarizeRawStatus(printResult.err()));
    }
    debug(`finished printing document of ${data.length} bytes`);
    return ok();
  }
}
