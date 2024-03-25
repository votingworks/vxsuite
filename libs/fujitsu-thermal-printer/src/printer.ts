import { Optional, Result, err, ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { print } from './printing';
import {
  FujitsuThermalPrinterDriverInterface,
  SpeedSetting,
  getFujitsuThermalPrinterDriver,
} from './driver';
import { rootDebug } from './debug';
import { IDLE_REPLY_PARAMETER, LINE_FEED_REPLY_PARAMETER } from './globals';
import {
  PrinterStatus,
  summarizeRawStatus,
  waitForPrintReadyStatus,
} from './status';

const debug = rootDebug.extend('printer');

export type PrintResult = Result<void, PrinterStatus>;

export interface FujitsuThermalPrinterInterface {
  initialize(): Promise<void>;
  getStatus(): Promise<PrinterStatus>;
  print(data: Uint8Array): Promise<PrintResult>;
  advancePaper(lineFeedCount: number): Promise<PrintResult>;
}

export class FujitsuThermalPrinter implements FujitsuThermalPrinterInterface {
  private readonly driver: FujitsuThermalPrinterDriverInterface;

  constructor(_driver: FujitsuThermalPrinterDriverInterface) {
    this.driver = _driver;
  }

  async initialize(): Promise<void> {
    await this.driver.connect();
    await this.driver.resetPrinter();
    await this.driver.setReplyParameter(IDLE_REPLY_PARAMETER);
  }

  async getStatus(): Promise<PrinterStatus> {
    const status = await this.driver.getStatus();
    return summarizeRawStatus(status);
  }

  async advancePaper(
    millimeters: number
  ): Promise<Result<void, PrinterStatus>> {
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
      retries: 100,
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
    const printResult = await print(this.driver, data);
    if (printResult.isErr()) {
      debug(`print failed on status: ${JSON.stringify(printResult.err())}`);
      return err(summarizeRawStatus(printResult.err()));
    }
    debug(`finished printing document of ${data.length} bytes`);
    return ok();
  }

  async setSpeed(speed: SpeedSetting): Promise<void> {
    await this.driver.setSpeed(speed);
    debug(`set speed to ${speed}`);
  }
}

export async function getFujitsuThermalPrinter(): Promise<
  Optional<FujitsuThermalPrinter>
> {
  const driver = await getFujitsuThermalPrinterDriver();
  if (!driver) {
    return;
  }

  const printer = new FujitsuThermalPrinter(driver);
  await printer.initialize();
  return printer;
}
