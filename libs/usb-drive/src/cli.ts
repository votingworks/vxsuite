/* istanbul ignore file */
import { LogSource, Logger } from '@votingworks/logging';
import { detectUsbDrive } from './usb_drive';
import { UsbDrive } from './types';

async function printStatus(usbDrive: UsbDrive, stdout: NodeJS.WriteStream) {
  const status = await usbDrive.status();
  stdout.write(`${JSON.stringify(status)}\n`);
}

async function watchUsbDrive(logger: Logger): Promise<void> {
  const { stdout } = process;
  // onRefreshFn is set synchronously after detectUsbDrive returns.
  // Since doRefresh fires asynchronously, it's always defined when called.
  let onRefreshFn: (() => Promise<void>) | undefined;
  const usbDrive = detectUsbDrive(logger, () => void onRefreshFn?.());
  onRefreshFn = () => printStatus(usbDrive, stdout);
  // Wait until process is terminated (e.g. Ctrl+C)
  await new Promise<never>(() => {});
}

const USAGE = `Usage: usb-drive status|eject|format|watch\n`;

export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  const command = args[2];
  const logger = new Logger(LogSource.System, () => Promise.resolve('unknown'));

  if (command === 'watch') {
    await watchUsbDrive(logger);
    return 0;
  }

  const usbDrive = detectUsbDrive(logger);
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
