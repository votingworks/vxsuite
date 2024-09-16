import { Optional, Result, assert, err, ok } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { LogEventId, Logger } from '@votingworks/logging';
import { print } from './printing';
import {
  FujitsuThermalPrinterDriver,
  FujitsuThermalPrinterDriverInterface,
  getDevice,
} from './driver';
import { rootDebug } from './debug';
import { IDLE_REPLY_PARAMETER, LINE_FEED_REPLY_PARAMETER } from './globals';
import { summarizeRawStatus, waitForPrintReadyStatus } from './status';
import { FujitsuThermalPrinterInterface, PrinterStatus } from './types';
import { MockFileFujitsuPrinter } from './mocks/file_printer';
import { logPrinterStatusIfChanged } from './logging';

const debug = rootDebug.extend('printer');

// the mechanism by default runs at 8cm/s, so this is a generous, 2x estimate
const WAIT_FOR_ADVANCE_APPEAR_PER_CM_MS = 250;

export class FujitsuThermalPrinter implements FujitsuThermalPrinterInterface {
  private driver?: FujitsuThermalPrinterDriverInterface;
  private lastKnownStatus?: PrinterStatus;

  constructor(private readonly logger: Logger) {}

  /**
   * Initializes and returns a new driver instance.
   */
  private async initializeDriver(): Promise<
    Optional<FujitsuThermalPrinterDriver>
  > {
    const device = await getDevice();
    if (!device) {
      // the device is not attached or there is an access issue
      return;
    }

    const driver = new FujitsuThermalPrinterDriver(device);
    await driver.connect();

    // standardize the printer's configuration
    await driver.resetPrinter();
    await driver.setPrintQuality({
      paperQuality: 'long-term-storage',
      automaticDivision: true,
    });
    await driver.setReplyParameter(IDLE_REPLY_PARAMETER);

    return driver;
  }

  /**
   * Gets the status of the printer. Handles device connection and disconnection.
   */
  async getStatus(): Promise<PrinterStatus> {
    const newStatus = await this.getCurrentStatus();
    await logPrinterStatusIfChanged(
      this.logger,
      this.lastKnownStatus,
      newStatus
    );
    this.lastKnownStatus = newStatus;
    return newStatus;
  }

  private async getCurrentStatus(): Promise<PrinterStatus> {
    this.driver ??= await this.initializeDriver();
    // if we failed to initialize the driver, the device is likely not connected
    if (!this.driver) {
      return { state: 'error', type: 'disconnected' };
    }

    try {
      const status = await this.driver.getStatus();
      return summarizeRawStatus(status);
    } catch {
      // if a status request fails, the device is likely no longer connected
      this.driver = undefined;
      return { state: 'error', type: 'disconnected' };
    }
  }

  async advancePaper(
    millimeters: number
  ): Promise<Result<void, PrinterStatus>> {
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
    assert(this.driver);
    await this.logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
      message: 'Initiating print',
    });

    const printResult = await print(this.driver, data);
    if (printResult.isErr()) {
      await this.logger.logAsCurrentRole(
        LogEventId.PrinterPrintComplete,
        {
          message: 'Print request failed.',
          errorDetails: JSON.stringify(printResult.err()),
          disposition: 'failure',
        },
        debug
      );
      return err(summarizeRawStatus(printResult.err()));
    }
    await this.logger.logAsCurrentRole(
      LogEventId.PrinterPrintComplete,
      {
        message: `Print job completed successfully with ${data.length} bytes.`,
        disposition: 'success',
      },
      debug
    );
    return ok();
  }
}

export function getFujitsuThermalPrinter(
  logger: Logger
): FujitsuThermalPrinterInterface {
  // mock printer for development and integration tests
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_PRINTER)) {
    return new MockFileFujitsuPrinter(logger);
  }

  return new FujitsuThermalPrinter(logger);
}
