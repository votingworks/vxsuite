/* istanbul ignore file */
import { LogSource, Logger } from '@votingworks/logging';
import { detectMultiUsbDrive, MultiUsbDrive } from './multi_usb_drive';
import type { UsbDriveFilesystemType } from './multi_usb_drive';

function printDrives(multiUsbDrive: MultiUsbDrive, stdout: NodeJS.WriteStream) {
  stdout.write(`${JSON.stringify(multiUsbDrive.getDrives(), null, 2)}\n`);
}

const USAGE = `Usage: usb-drive <command>

Commands:
  status                          List all drives as JSON (auto-mounts supported partitions)
  eject <devPath>                 Eject a drive (unmount + prevent auto-remount)
  format <devPath> [fat32|ext4]   Format a specific drive (default: fat32)
  watch                           Watch for USB drive changes (auto-mounts supported partitions)
`;

function isValidFstype(value: string): value is UsbDriveFilesystemType {
  return value === 'fat32' || value === 'ext4';
}

export async function main(args: string[]): Promise<number> {
  const { stdout, stderr } = process;
  const command = args[2];

  if (!command) {
    stderr.write(USAGE);
    return 0;
  }

  const logger = new Logger(LogSource.System, () => Promise.resolve('unknown'));

  if (command === 'watch') {
    const multiUsbDrive = detectMultiUsbDrive(logger, {
      onChange: () => printDrives(multiUsbDrive, stdout),
    });
    // Wait until process is terminated (e.g. Ctrl+C)
    await new Promise<never>(() => {});
  }

  const multiUsbDrive = detectMultiUsbDrive(logger);
  await multiUsbDrive.refresh();

  try {
    switch (command) {
      case 'status': {
        printDrives(multiUsbDrive, stdout);
        break;
      }

      case 'eject': {
        const devPath = args[3];
        if (!devPath) {
          stderr.write('Error: <devPath> is required\n');
          stderr.write('Usage: usb-drive eject <devPath>\n');
          return 1;
        }
        await multiUsbDrive.ejectDrive(devPath);
        stdout.write(`Ejected ${devPath}\n`);
        await multiUsbDrive.refresh();
        printDrives(multiUsbDrive, stdout);
        break;
      }

      case 'format': {
        const devPath = args[3];
        const fstypeArg = args[4] ?? 'fat32';
        if (!devPath) {
          stderr.write('Error: <devPath> is required\n');
          stderr.write('Usage: usb-drive format <devPath> [fat32|ext4]\n');
          return 1;
        }
        if (!isValidFstype(fstypeArg)) {
          stderr.write(`Error: invalid filesystem type "${fstypeArg}"\n`);
          stderr.write('Usage: usb-drive format <devPath> [fat32|ext4]\n');
          return 1;
        }
        stdout.write(`Formatting ${devPath} as ${fstypeArg}...\n`);
        await multiUsbDrive.formatDrive(devPath, fstypeArg);
        stdout.write('Formatted.\n');
        await multiUsbDrive.refresh();
        printDrives(multiUsbDrive, stdout);
        break;
      }

      default: {
        stderr.write(`Unknown command: ${command}\n`);
        stderr.write(USAGE);
        return 1;
      }
    }
  } finally {
    multiUsbDrive.stop();
  }

  return 0;
}
