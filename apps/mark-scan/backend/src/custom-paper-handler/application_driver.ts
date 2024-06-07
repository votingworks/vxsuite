import { assert, sleep } from '@votingworks/basics';
import makeDebug from 'debug';
import {
  PaperHandlerDriver,
  getPaperHandlerDriver,
} from '@votingworks/custom-paper-handler';
import { tmpNameSync } from 'tmp';
import { RESET_DELAY_MS } from './constants';
import { isPaperAnywhere } from './scanner_status';

const debug = makeDebug('mark-scan:custom-paper-handler:application-driver');

/**
 * This file is the layer between libs/custom-paper-handler/driver and mark-scan state machine.
 * It abstracts application-specific logic but doesn't send low-level USB commands directly to
 * the paper handler. Functions that are more complicated than a single driver command
 * invocation belong here.
 * A good rule of thumb is: if only the paper handler driver and external VX libs are being called,
 * the function belongs here. If the state machine state is being read or updated, it belongs in
 * ./state_machine.ts
 */

export async function setDefaults(driver: PaperHandlerDriver): Promise<void> {
  await driver.initializePrinter();
  debug('initialized printer (0x1B 0x40)');
  await driver.setLineSpacing(0);
  debug('set line spacing to 0');
  await driver.setPrintingSpeed('slow');
  debug('set printing speed to slow');
}

export async function scanAndSave(driver: PaperHandlerDriver): Promise<string> {
  const pathOutFront = tmpNameSync({ postfix: '.jpeg' });
  const status = await driver.getPaperHandlerStatus();
  // Scan can happen from loaded or parked state. If the paper is not loaded or parked
  // it means the voter may have taken the paper out of the infeed
  if (!isPaperAnywhere(status)) {
    throw new Error('Paper has been removed');
  }

  await driver.scanAndSave(pathOutFront);

  // We can only print to one side from the thermal printer, but the interpret flow expects
  // a SheetOf 2 pages. Use an image of a blank sheet for the 2nd page.
  return pathOutFront;
}

export async function loadAndParkPaper(
  driver: PaperHandlerDriver
): Promise<void> {
  await driver.loadPaper();
  await driver.parkPaper();
}

export async function resetAndReconnect(
  oldDriver: PaperHandlerDriver,
  /* istanbul ignore next - override is provided so tests don't need to wait the full delay duration. Tests will never exercise the default value */
  resetDelay: number = RESET_DELAY_MS
): Promise<PaperHandlerDriver> {
  await oldDriver.resetScan();
  // resetScan() command resolves with success as soon as the command is received, not when the command completes.
  // It actually takes ~7 seconds to complete, so we force the state machine to stay in this state until it's done.
  // TODO can we transition in the state machine using printer state instead of waiting a fixed time?
  await sleep(resetDelay);
  await oldDriver.disconnect();
  debug('Getting new driver');
  const newDriver = await getPaperHandlerDriver();
  assert(newDriver, 'Could not create new paper handler driver');
  await setDefaults(newDriver);
  return newDriver;
}
