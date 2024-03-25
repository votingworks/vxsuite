/* eslint-disable vx/no-floating-results */
/* eslint-disable no-console */

import { createInterface } from 'readline';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { safeParseInt } from '@votingworks/types';
import { FujitsuThermalPrinter, getFujitsuThermalPrinter } from './printer';
import { SpeedSetting } from './driver';

/**
 * Command line interface for interacting with the paper handler driver.
 * Usage: ./bin/cli command
 */

enum Command {
  GetStatus = 'status',
  PollStatus = 'poll',
  AdvancePaper = 'advance',
  Print = 'print',
  PrintFixture = 'print-fixture',
  SetSpeed = 'set-speed',
}
const commandList = Object.values(Command);

function printUsage() {
  console.log(`Usage:\n`);
  console.log(`    status (get printer status)`);
  console.log(`    poll (poll printer status)`);
  console.log(`    print-fixture (print example report)`);
  console.log(`    print <path> (print from file, 8.5in wide PDF)`);
  console.log(`    advance <millimeters> (move the paper forward)`);
  console.log(`    set-speed <11|12|13|14|15|21|22|23|24|25>`);
}

function printFromFile(printer: FujitsuThermalPrinter, path: string) {
  if (!existsSync(path)) {
    printUsage();
    return;
  }

  return printer.print(readFileSync(path));
}

const fixturePath = join(
  __dirname,
  '../test/fixtures/tally-report-single-page.pdf'
);

const speedMapping: Record<number, SpeedSetting> = {
  11: SpeedSetting.Type1Mode1,
  12: SpeedSetting.Type1Mode2,
  13: SpeedSetting.Type1Mode3,
  14: SpeedSetting.Type1Mode4,
  15: SpeedSetting.Type1Mode5,
  21: SpeedSetting.Type2Mode1,
  22: SpeedSetting.Type2Mode2,
  23: SpeedSetting.Type2Mode3,
  24: SpeedSetting.Type2Mode4,
  25: SpeedSetting.Type2Mode5,
};

async function handleCommand(
  printer: FujitsuThermalPrinter,
  command: Command,
  args: string[]
) {
  switch (command) {
    case Command.GetStatus:
      console.log(await printer.getStatus());
      break;
    case Command.AdvancePaper: {
      const parseResult = safeParseInt(args[0]);
      if (!parseResult.isOk()) {
        printUsage();
        break;
      }
      await printer.advancePaper(parseResult.ok());
      break;
    }
    case Command.Print: {
      const path = args[0];
      if (!path) {
        printUsage();
        break;
      }
      await printFromFile(printer, path);
      break;
    }
    case Command.PrintFixture:
      await printFromFile(printer, fixturePath);
      break;
    case Command.PollStatus:
      setInterval(async () => {
        console.log(await printer.getStatus());
      }, 1000);
      break;
    case Command.SetSpeed: {
      const parseResult = safeParseInt(args[0]);
      if (!parseResult.isOk()) {
        printUsage();
        break;
      }
      const speed = speedMapping[parseResult.ok()];
      if (!speed) {
        printUsage();
        break;
      }
      await printer.setSpeed(speed);
      break;
    }
    default:
      throwIllegalValue(command);
  }

  console.log('Command finished');
}

export async function main(): Promise<number> {
  printUsage();

  const printer = await getFujitsuThermalPrinter();
  assert(printer, 'Could not get printer. Is a printer connected?');

  const lines = createInterface(process.stdin);

  for await (const line of lines) {
    const parts = line.split(' ');
    const [commandString, ...additionalArgs] = parts;

    if (!commandString) {
      console.log('No command provided');
      continue;
    }

    if (!commandList.includes(commandString as Command)) {
      printUsage();
      continue;
    }

    await handleCommand(printer, commandString as Command, additionalArgs);
  }

  return 0;
}
