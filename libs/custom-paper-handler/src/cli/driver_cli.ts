/* eslint-disable no-console */

import { createInterface } from 'readline';
import { assert, assertDefined, sleep } from '@votingworks/basics';
import { join } from 'path';
import { tmpdir } from 'os';
import { getPaperHandlerDriver } from '../driver/helpers';
import { MaxPrintWidthDots, PaperHandlerDriverInterface } from '../driver';
import { ScanDirection, scanDirections } from '../driver/scanner_config';

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
  LoadPaper = 'load-paper',
  Park = 'park',
  EnablePrint = 'enable-print',
  PrintSampleBallot = 'print-sample-ballot',
  PrintSampleBallotShorthand = 'p',
  ResetScan = 'reset-scan',
  Help = 'help',
  Scan = 'scan',
  SetScanDirection = 'set-scan-dir',
  FlushTransferInGeneric = 'flush-in',
}
const commandList = Object.values(Command);

function printUsage() {
  console.log(`Valid commands: ${JSON.stringify(commandList)}`);
}

// It seems commands that fail unexpectedly will result in the scanner pausing transfer-in data.
// This data is sent to the driver on next command, which is then unable to parse the response
// because the data is partially from the previous failed command and partially from the newly
// issued command.
async function flushTransferInGeneric(driver: PaperHandlerDriverInterface) {
  await driver.clearGenericInBuffer();
}

async function scan(driver: PaperHandlerDriverInterface): Promise<void> {
  const dateString = new Date().toISOString();
  const pathOut = join(tmpdir(), `ballot-driver-cli-${dateString}.jpg`);
  console.log('Writing scan to', pathOut);
  await driver.scanAndSave(pathOut);
}

async function setDefaults(driver: PaperHandlerDriverInterface) {
  await driver.initializePrinter();
  console.log('initialized printer');
  await driver.setLineSpacing(0);
  console.log('set line spacing to 0');
  await driver.setPrintingSpeed('slow');
  console.log('set printing speed to slow');
}

async function setScanDirection(
  driver: PaperHandlerDriverInterface,
  args: string[]
) {
  if (args.length === 0) {
    console.log(
      `Missing required argument. Provide one of ${JSON.stringify(
        scanDirections
      )}`
    );
    return;
  }

  const direction = assertDefined(args[0]) as ScanDirection;
  switch (direction) {
    case 'forward':
    case 'backward':
    case 'in_park':
      await driver.setScanDirection(direction);
      console.log('Scan direction set to', direction);
      break;
    default:
      console.log('Unsupported scan direction', direction);
  }
}

async function handleCommand(
  driver: PaperHandlerDriverInterface,
  command: Command,
  args: string[] = []
) {
  if (command === Command.InitPrinter) {
    console.log('Initializing printer');
    await driver.initializePrinter();
  } else if (command === Command.Status) {
    console.log('Requesting status from paper handler');
    const status = await driver.getPaperHandlerStatus();
    console.log(JSON.stringify(status, null, 2));
  } else if (command === Command.EjectFront) {
    console.log('Ejecting paper to front');
    await driver.ejectPaperToFront();
  } else if (command === Command.EjectBack) {
    console.log('Ejecting paper to back');
    await driver.ejectBallotToRear();
  } else if (command === Command.LoadPaper) {
    console.log('Loading paper');
    await driver.loadPaper();
  } else if (command === Command.Park) {
    console.log('Parking paper');
    await driver.parkPaper();
  } else if (command === Command.EnablePrint) {
    console.log('Enabling print');
    await driver.enablePrint();
  } else if (command === Command.ResetScan) {
    console.log('Resetting scan');
    await driver.resetScan();
    // Reset command returns acknowledgement before things are actually reset. Manual says reset happens after 2s but it seems more like 5.
    // Wait then exit to force new connection.
    console.log('Reset issued. Waiting 5s for command to finish.');
    await sleep(5000);
    console.log('Exiting');
    process.exit(0);
  } else if (command === Command.SetDefaults) {
    console.log('Set defaults');
    await setDefaults(driver);
  } else if (command === Command.Help) {
    printUsage();
  } else if (command === Command.SetScanDirection) {
    await setScanDirection(driver, args);
  } else if (command === Command.Scan) {
    await scan(driver);
  } else if (command === Command.FlushTransferInGeneric) {
    await flushTransferInGeneric(driver);
  } else {
    throw new Error(`Unhandled command '${command}'`);
  }

  console.log('Command finished');
}

export async function main(): Promise<number> {
  printUsage();

  const initialArgs = process.argv;

  let maxPrintWidth = MaxPrintWidthDots.BMD_155;
  if (initialArgs.includes('--bmd150')) {
    maxPrintWidth = MaxPrintWidthDots.BMD_150;
  }

  const driver = await getPaperHandlerDriver({
    maxPrintWidth,
  });
  assert(
    driver,
    'Could not get paper handler driver. Is a paper handler device connected?'
  );

  const lines = createInterface(process.stdin);
  if (initialArgs.length > 2 && initialArgs[2] === '--reset') {
    await handleCommand(driver, Command.ResetScan);
  }
  if (initialArgs.length > 2 && initialArgs[2] === '--flush') {
    await handleCommand(driver, Command.FlushTransferInGeneric);
  }

  await handleCommand(driver, Command.InitPrinter);
  await handleCommand(driver, Command.SetDefaults);
  await handleCommand(driver, Command.EnablePrint);

  for await (const line of lines) {
    const parts = line.split(' ');
    const commandString = parts[0];
    const args = parts.slice(1);

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

    await handleCommand(driver, commandString as Command, args);
  }

  return 0;
}
