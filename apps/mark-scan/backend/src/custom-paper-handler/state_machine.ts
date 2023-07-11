import makeDebug from 'debug';
import { assert, Optional, throwIllegalValue } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { createImageData } from 'canvas';
import {
  getPaperHandlerDriver,
  PaperHandlerDriver,
  PaperHandlerStatus,
  chunkBinaryBitmap,
  ImageConversionOptions,
  imageDataToBinaryBitmap,
  VERTICAL_DOTS_IN_CHUNK,
} from '@votingworks/custom-paper-handler';
import { SimpleServerStatus, SimpleStatus } from './types';

const debug = makeDebug('mark-scan:state-machine');

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

export class PaperHandlerStateMachine {
  private status: SimpleStatus = 'no_paper';
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
  async getSimpleStatus(): Promise<SimpleServerStatus> {
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
      case 'paper_parked':
        // Nothing to do - frontend triggers status change. This will change soon so not
        // worth centralizing machine logic
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
      case 'ballot_printed':
        // Unimplemented
        break;
      default:
        throwIllegalValue(this.status);
    }
    return this.status;
  }

  resetStatus(): void {
    this.status = 'no_paper';
  }

  async logStatus(): Promise<void> {
    debug('%O', await this.driver.getPaperHandlerStatus());
  }

  /**
   * Parks paper inside the handler. If there is no paper to park, returns
   * negative acknowledgement. If paper already parked, does nothing and returns
   * positive acknowledgement. When parked, parkSensor should be true.
   */
  async parkPaper(): Promise<void> {
    debug('+parkPaper');
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
    const grayscaleData = grayscaleResult.data;
    const colorResult = createImageData(
      grayscaleResult.width,
      grayscaleResult.height
    );
    const colorData = new Uint32Array(
      colorResult.data.buffer,
      colorResult.data.byteOffset,
      colorResult.data.byteLength
    );
    for (let i = 0; i < grayscaleData.byteLength; i += 1) {
      const luminance = grayscaleData[i];
      colorData[i] =
        // eslint-disable-next-line no-bitwise
        (luminance << 24) | (luminance << 16) | (luminance << 8) | 255;
    }
    await writeImageData(pathOut, colorResult);
  }

  async printBallot(
    pdfData: Uint8Array,
    options: Partial<ImageConversionOptions> = {}
  ): Promise<void> {
    this.status = 'printing_ballot';
    const enablePrintPromise = this.enablePrint();

    let time = Date.now();
    const pages: ImageData[] = [];
    for await (const { page, pageCount } of pdfToImages(Buffer.from(pdfData), {
      scale: 200 / 72,
    })) {
      assert(pageCount === 1, `Unexpected page count ${pageCount}`);
      pages.push(page);
    }
    const page = pages[0];
    assert(page, 'Unexpected undefined page');
    debug(`pdf to image took ${Date.now() - time} ms`);
    time = Date.now();

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
        dotsSkipped += VERTICAL_DOTS_IN_CHUNK;
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

export async function getPaperHandlerStateMachine(): Promise<
  Optional<PaperHandlerStateMachine>
> {
  const paperHandlerDriver = await getPaperHandlerDriver();
  if (!paperHandlerDriver) return;

  const paperHandlerStateMachine = new PaperHandlerStateMachine(
    paperHandlerDriver
  );
  await paperHandlerStateMachine.setDefaults();
  return paperHandlerStateMachine;
}
