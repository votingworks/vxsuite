import makeDebug from 'debug';
import { assert, Optional } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { PrintScan } from '@votingworks/api';
import { createImageData } from 'canvas';
import {
  chunkBinaryBitmap,
  ImageConversionOptions,
  imageDataToBinaryBitmap,
} from './printing';
import { PaperHandlerStatus } from './driver/sensors';
import { getPaperHandlerDriver, PaperHandlerDriver } from './driver/driver';
import { Uint8 } from './bits';

const serverDebug = makeDebug('paper-handler:machine');

function debug(message: string) {
  serverDebug(message);
  console.log(message);
}

// const LOAD_PAPER_TIMEOUT_MS = 3000;

function isPaperInInput(paperHandlerStatus: PaperHandlerStatus): boolean {
  return (
    paperHandlerStatus.paperInputLeftInnerSensor ||
    paperHandlerStatus.paperInputLeftOuterSensor ||
    paperHandlerStatus.paperInputRightInnerSensor ||
    paperHandlerStatus.paperInputRightOuterSensor
  );
}

function isPaperReadyToLoad(paperHandlerStatus: PaperHandlerStatus): boolean {
  return (
    paperHandlerStatus.paperInputLeftInnerSensor &&
    paperHandlerStatus.paperInputLeftOuterSensor &&
    paperHandlerStatus.paperInputRightInnerSensor &&
    paperHandlerStatus.paperInputRightOuterSensor
  );
}

function isPaperInScanner(paperHandlerStatus: PaperHandlerStatus): boolean {
  return (
    paperHandlerStatus.paperPreCisSensor ||
    paperHandlerStatus.paperPostCisSensor ||
    paperHandlerStatus.preHeadSensor ||
    paperHandlerStatus.paperOutSensor ||
    paperHandlerStatus.parkSensor ||
    paperHandlerStatus.paperJam ||
    paperHandlerStatus.scanInProgress
  );
}

function isPaperAnywhere(paperHandlerStatus: PaperHandlerStatus): boolean {
  return (
    isPaperInInput(paperHandlerStatus) || isPaperInScanner(paperHandlerStatus)
  );
}

export class PaperHandlerMachine {
  private status: PrintScan.SimpleStatus = 'no_paper';
  private lastActionInitiatedTime = 0;

  constructor(private readonly driver: PaperHandlerDriver) {}

  async setDefaults(): Promise<void> {
    await this.driver.initializePrinter();
    debug('initialized printer (0x1B 0x40)');
    await this.driver.setLineSpacing(0);
    debug('set line spacing to 0');
    await this.driver.setPrintingSpeed('slow');
    debug('set printing speed to slow');
  }

  // Hacky "state machine"
  async getSimpleStatus(): Promise<PrintScan.SimpleServerStatus> {
    // detailed sensor state
    const paperHandlerStatus = await this.driver.getPaperHandlerStatus();

    switch (this.status) {
      case 'no_paper':
        if (isPaperReadyToLoad(paperHandlerStatus)) {
          this.status = 'paper_ready_to_load';
        }
        break;
      case 'paper_ready_to_load':
        if (!isPaperReadyToLoad(paperHandlerStatus)) {
          this.status = 'no_paper';
        }
        break;
      case 'parking_paper':
        if (paperHandlerStatus.parkSensor) {
          this.status = 'paper_parked';
        } else if (Date.now() - this.lastActionInitiatedTime > 10_000) {
          this.status = 'no_paper';
        }
        break;
      case 'printing_ballot':
        if (!isPaperInScanner(paperHandlerStatus)) {
          this.status = 'ballot_printed';
        }
        break;
      case 'ejecting':
        if (!isPaperAnywhere(paperHandlerStatus)) {
          this.status = 'no_paper';
        }
        break;
      default:
      // do nothing
    }
    return this.status;
  }

  resetStatus(): void {
    this.status = 'no_paper';
  }

  /**
   * Parks paper inside the handler. If there is no paper to park, returns
   * negative acknowledgement.If paper already parked, does nothing and returns
   * positive acknowledgement. When parked, parkSensor should be true.
   */
  async parkPaper(): Promise<void> {
    // if ((await this.getSimpleStatus()) !== 'paper_loaded') {
    //   // this is not a restriction of the hardware, just of the prototype state.
    //   // can park as long as paper is in the handler (but not if it was never loaded)
    //   throw new Error('can only park from loaded state');
    // }
    debug('+parkPaper');
    console.log(await this.driver.getPaperHandlerStatus());
    this.status = 'parking_paper';
    this.lastActionInitiatedTime = Date.now();
    await this.driver.parkPaper();
    debug('-parkPaper');
  }

  /**
   * Moves paper to the front for voter to see, but hangs on to the paper.
   * Equivalent to "reject hold." How do we differentiate the present paper
   * state from the state where paper has not been picked up yet?
   */
  async presentPaper(): Promise<void> {
    await this.driver.presentPaper();
  }

  /**
   * Ejects out the back. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async eject(): Promise<void> {
    this.status = 'ejecting';
    await this.driver.ejectBallot();
  }

  /**
   * Ejects out the front. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectPaper(): Promise<void> {
    this.status = 'ejecting';
    await this.driver.ejectPaper();
  }

  /**
   * Moves paper to print position and moves print head to DOWN position. If
   * paper is already in an appropriate print position, does not move paper.
   * E.g. if paper is loaded, it will pull the paper in a few more inches, but
   * if the paper is parked, it will not move the paper. Printing can start in
   * a variety of positions.
   */
  async enablePrint(): Promise<void> {
    await this.driver.enablePrint();
  }

  /**
   * Moves print head to UP position, does not move paper
   */
  async disablePrint(): Promise<void> {
    await this.driver.disablePrint();
  }

  async scanAndSave(pathOut: string): Promise<void> {
    await this.driver.setScanDirection('backward');
    const grayscaleResult = await this.driver.scan();
    const colorResult = new Uint8Array(grayscaleResult.byteLength * 4);
    for (let i = 0; i < grayscaleResult.byteLength; i += 1) {
      colorResult.set(
        [
          grayscaleResult.at(i) as Uint8,
          grayscaleResult.at(i) as Uint8,
          grayscaleResult.at(i) as Uint8,
          255,
        ],
        i * 4
      );
    }
    const imageData = createImageData(
      Uint8ClampedArray.from(colorResult),
      1728,
      grayscaleResult.byteLength / 1728
    );
    await writeImageData(pathOut, imageData);
  }

  async printBallot(
    pdfData: Uint8Array,
    options: Partial<ImageConversionOptions> = {}
  ): Promise<void> {
    if ((await this.getSimpleStatus()) !== 'paper_parked') {
      // You can begin print from loading state as well, but not for demo
      // throw new Error('no parked paper to print on');
    }

    this.status = 'printing_ballot';
    const enablePrintPromise = this.enablePrint();

    let time = Date.now();
    const pages: ImageData[] = [];
    for await (const { page, pageCount } of pdfToImages(Buffer.from(pdfData), {
      scale: 200 / 72,
    })) {
      assert(pageCount === 1);
      pages.push(page);
    }
    const page = pages[0];
    assert(page);
    debug(`pdf to image took ${Date.now() - time} ms`);
    time = Date.now();
    // For prototype we expect image to have the same number of dots as the printer width.
    // This is likely a requirement long term but we should have guarantees upstream.
    assert(page.width === 1600);

    const ballotBinaryBitmap = imageDataToBinaryBitmap(page, options);
    debug(`bitmap width: ${ballotBinaryBitmap.width}`);
    debug(`bitmap height: ${ballotBinaryBitmap.height}`);
    debug(`image to binary took ${Date.now() - time} ms`);
    time = Date.now();

    const customChunkedBitmaps = chunkBinaryBitmap(ballotBinaryBitmap);
    debug(`num chunk rows: ${customChunkedBitmaps.length}`);
    debug(`binary to chunks took ${Date.now() - time} ms`);
    time = Date.now();

    await enablePrintPromise;
    let dotsSkipped = 0;
    debug(`begin printing ${customChunkedBitmaps.length} chunks`);
    let i = 0;
    for (const customChunkedBitmap of customChunkedBitmaps) {
      debug(`printing chunk ${i}`);
      if (customChunkedBitmap.empty) {
        dotsSkipped += 24;
      } else {
        if (dotsSkipped) {
          await this.driver.setRelativeVerticalPrintPosition(dotsSkipped * 2); // assuming default vertical units, 1 / 408 units
          dotsSkipped = 0;
        }
        await this.driver.printChunk(customChunkedBitmap);
      }
      i += 1;
    }
    debug('done printing ballot');
  }
}

export async function getPaperHandlerMachine(): Promise<
  Optional<PaperHandlerMachine>
> {
  const paperHandlerDriver = await getPaperHandlerDriver();
  if (!paperHandlerDriver) return;

  const paperHandlerMachine = new PaperHandlerMachine(paperHandlerDriver);
  await paperHandlerMachine.setDefaults();
  return paperHandlerMachine;
}
