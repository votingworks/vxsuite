import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Result,
  sleep,
} from '@votingworks/basics';

import { constructAuthMachineState } from '../util/auth';
import { ServerContext } from './context';

const CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS = 5;
const USB_DRIVE_FILE_NAME = 'electrical-testing.txt';

function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}

export async function cardReadAndUsbDriveWriteLoop({
  auth,
  usbDrive,
  workspace,
}: ServerContext): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const machineState = constructAuthMachineState(workspace.store);
    const cardReadResult = await auth.readCardData(machineState);
    workspace.store.setElectricalTestingStatusMessage(
      'card',
      resultToString(cardReadResult)
    );

    let usbDriveWriteResult: Result<void, unknown> = ok();
    try {
      const usbDriveStatus = await usbDrive.status();
      assert(usbDriveStatus.status === 'mounted', 'USB drive not mounted');
      await fs.appendFile(
        path.join(usbDriveStatus.mountPoint, USB_DRIVE_FILE_NAME),
        `${new Date().toISOString()}\n`
      );
    } catch (error) {
      usbDriveWriteResult = err(error);
    }
    workspace.store.setElectricalTestingStatusMessage(
      'usbDrive',
      resultToString(usbDriveWriteResult)
    );

    await sleep(CARD_READ_AND_USB_DRIVE_WRITE_INTERVAL_SECONDS * 1000);
  }
}

export async function printAndScanLoop(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sleep(5000);
  }
}
