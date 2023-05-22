/* eslint-disable no-console */

import { createInterface } from 'readline';
import { pdfToImages } from '@votingworks/image-utils';
import { Buffer } from 'buffer';
import { assert } from '@votingworks/basics';
import { PaperHandlerDriver, getPaperHandlerDriver } from '../driver/driver';
import { ballotFixture } from '../test/fixtures';
import { chunkBinaryBitmap, imageDataToBinaryBitmap } from '../printing';

/**
 * Command line interface for interacting with the paper handler driver.
 * Usage: ./bin/driver-cli command
 */

enum Command {
  InitPrinter = 'init-printer', // Raw init printer command
  SetDefaults = 'set-defaults', // Sets some defaults needed to operate printer
  Status = 'status',
  EjectFront = 'eject-front',
  EjectBack = 'eject-back',
  Park = 'park',
  EnablePrint = 'enable-print',
  PrintSampleBallot = 'print-sample-ballot',
  ResetScan = 'reset-scan',
}
const commandList = Object.values(Command);

/**
 * Unsafely prints a ballot from ballot fixtures. Adapted from paper_handler_machine.
 * Precondition: enable-print command has succeeded
 */
async function printBallot(driver: PaperHandlerDriver): Promise<void> {
  let time = Date.now();
  const pages: ImageData[] = [];
  for await (const { page, pageCount } of pdfToImages(
    Buffer.from(ballotFixture),
    {
      scale: 200 / 72,
    }
  )) {
    assert(pageCount === 1);
    pages.push(page);
  }
  const page = pages[0];
  assert(page);
  console.log(`pdf to image took ${Date.now() - time} ms`);
  time = Date.now();
  // For prototype we expect image to have the same number of dots as the printer width.
  // This is likely a requirement long term but we should have guarantees upstream.
  assert(page.width === 1600);

  const ballotBinaryBitmap = imageDataToBinaryBitmap(page, {});
  console.log(`bitmap width: ${ballotBinaryBitmap.width}`);
  console.log(`bitmap height: ${ballotBinaryBitmap.height}`);
  console.log(`image to binary took ${Date.now() - time} ms`);
  time = Date.now();

  const customChunkedBitmaps = chunkBinaryBitmap(ballotBinaryBitmap);
  console.log(`num chunk rows: ${customChunkedBitmaps.length}`);
  console.log(`binary to chunks took ${Date.now() - time} ms`);
  time = Date.now();

  let dotsSkipped = 0;
  console.log(`begin printing ${customChunkedBitmaps.length} chunks`);
  let i = 0;
  for (const customChunkedBitmap of customChunkedBitmaps) {
    console.log(`printing chunk ${i}`);
    if (customChunkedBitmap.empty) {
      dotsSkipped += 24;
    } else {
      if (dotsSkipped) {
        await driver.setRelativeVerticalPrintPosition(dotsSkipped * 2); // assuming default vertical units, 1 / 408 units
        dotsSkipped = 0;
      }
      await driver.printChunk(customChunkedBitmap);
    }
    i += 1;
  }
  console.log(`Done printing ballot. ${i} chunks printed.`);
}

async function setDefaults(driver: PaperHandlerDriver) {
  await driver.initializePrinter();
  console.log('initialized printer');
  await driver.setLineSpacing(0);
  console.log('set line spacing to 0');
  await driver.setPrintingSpeed('slow');
  console.log('set printing speed to slow');
}

async function handleCommand(driver: PaperHandlerDriver, command: Command) {
  if (command === Command.InitPrinter) {
    console.log('Initializing printer');
    await driver.initializePrinter();
  } else if (command === Command.Status) {
    console.log('Requesting status from paper handler');
    const status = await driver.getPaperHandlerStatus();
    console.log(JSON.stringify(status, null, 2));
  } else if (command === Command.EjectFront) {
    console.log('Ejecting paper to front');
    await driver.ejectPaper();
  } else if (command === Command.EjectBack) {
    console.log('Ejecting paper to back');
    await driver.ejectBallot();
  } else if (command === Command.Park) {
    console.log('Parking paper');
    await driver.parkPaper();
  } else if (command === Command.EnablePrint) {
    console.log('Enabling print');
    await driver.enablePrint();
  } else if (command === Command.PrintSampleBallot) {
    console.log('Printing sample ballot');
    await printBallot(driver);
  } else if (command === Command.ResetScan) {
    console.log('Resetting scan');
    await driver.resetScan();
  } else if (command === Command.SetDefaults) {
    console.log('Set defaults');
    await setDefaults(driver);
  } else {
    throw new Error(`Unhandled command '${command}'`);
  }

  console.log('Command finished\n');
}

export async function main(): Promise<number> {
  const driver = await getPaperHandlerDriver();
  assert(driver);

  console.log(
    `Enter a command. Valid commands: ${JSON.stringify(commandList)}`
  );
  const lines = createInterface(process.stdin);

  for await (const line of lines) {
    const parts = line.split(' ');
    const [commandString] = parts;

    if (!commandString) {
      console.log('No command provided');
      continue;
    }

    if (!commandList.includes(commandString as Command)) {
      console.log(
        `Unsupported command '${commandString}'.\nSupported commands: ${JSON.stringify(
          commandList
        )}\n`
      );
      continue;
    }

    console.log(`Received valid command '${commandString}'`);

    await handleCommand(driver, commandString as Command);
  }

  return 0;
}
