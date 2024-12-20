/* istanbul ignore file */
import { sleep } from '@votingworks/basics';
import { LogSource, Logger } from '@votingworks/logging';
import { detectUsbDrive } from './usb_drive';
import { UsbDrive } from './types';

async function printStatus(usbDrive: UsbDrive, stdout: NodeJS.WriteStream) {
  const status = await usbDrive.status();
  stdout.write(`${JSON.stringify(status)}\n`);
}

async function watchUsbDrive(usbDrive: UsbDrive): Promise<void> {
  const { stdout } = process;
  for (;;) {
    await printStatus(usbDrive, stdout);
    await sleep(1000);
  }
}

const USAGE = `Usage: usb-drive status|eject|format|watch\n`;

export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  const command = args[2];
  const usbDrive = detectUsbDrive(
    new Logger(LogSource.System, () => Promise.resolve('unknown'))
  );
  switch (command) {
    case 'status': {
      await printStatus(usbDrive, stdout);
      break;
    }
    case 'eject': {
      await usbDrive.eject();
      stdout.write('Ejected\n');
      await printStatus(usbDrive, stdout);
      break;
    }
    case 'format': {
      await usbDrive.format();
      stdout.write('Formatted\n');
      await printStatus(usbDrive, stdout);
      break;
    }
    case 'watch': {
      await watchUsbDrive(usbDrive);
      break;
    }
    case undefined: {
      stderr.write(USAGE);
      break;
    }
    default: {
      stderr.write(`Unknown command: ${command}\n`);
      stderr.write(USAGE);
      return 1;
    }
  }
  return 0;
}
