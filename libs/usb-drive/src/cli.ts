import { sleep } from '@votingworks/basics';
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

export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  const command = args[2];
  const usbDrive = detectUsbDrive();
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
    case 'watch': {
      await watchUsbDrive(usbDrive);
      break;
    }
    case undefined: {
      stderr.write(`Usage: usb-drive status|eject|watch\n`);
      break;
    }
    default: {
      stderr.write(`Unknown command: ${command}\n`);
      stderr.write(`Usage: usb-drive status|eject|watch\n`);
      return 1;
    }
  }
  return 0;
}
