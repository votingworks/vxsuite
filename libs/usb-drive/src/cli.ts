/* istanbul ignore file */
import { sleep } from '@votingworks/basics';
import { Logger, LogSource } from '@votingworks/logging';
import { detectUsbDrive, UsbDrive } from './usb_drive';

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
  const usbDrive = detectUsbDrive(new Logger(LogSource.System));
  switch (command) {
    case 'status': {
      await printStatus(usbDrive, stdout);
      break;
    }
    case 'eject': {
      await usbDrive.eject('election_manager');
      stdout.write('Ejected\n');
      await printStatus(usbDrive, stdout);
      break;
    }
    case 'format': {
      await usbDrive.format('system_administrator');
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
