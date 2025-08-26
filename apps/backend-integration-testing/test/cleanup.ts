import { error } from 'node:console';
import { rmSync } from 'fs-extra';
import { resolve } from 'node:path';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { mockCardRemoval } from '@votingworks/auth';

let tmpFiles: string[] = [];

const tmpFileRegex = /^\/tmp\/.+/;

export function deleteTmpFileAfterTestSuiteCompletes(path: string): void {
  if (!tmpFileRegex.test(resolve(path))) {
    throw error(
      'only files under the /tmp directory can be automatically cleaned up'
    );
  }
  tmpFiles.push(path);
}

export function cleanupTestSuiteTmpFiles(): void {
  for (const tmpFile of tmpFiles) {
    rmSync(tmpFile, { recursive: true, force: true });
  }
  tmpFiles = [];
}

export function resetSharedMocks(): void {
  const usbHandler = getMockFileUsbDriveHandler();
  usbHandler.remove();

  mockCardRemoval();

  process.env.VX_MACHINE_TYPE = undefined;
}
