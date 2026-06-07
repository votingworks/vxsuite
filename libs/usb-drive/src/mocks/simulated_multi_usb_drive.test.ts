import { expect, test } from 'vitest';
import { SimulatedMultiUsbDrive } from './simulated_multi_usb_drive';
import { UsbDriveInfo, UsbPartitionInfo } from '../multi_usb_drive';

test('addUsbDrive', () => {
  const usb = new SimulatedMultiUsbDrive();
  usb.addUsbDrive({}, { devPath: '/dev/sdb' });

  expect(usb.multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([
    {
      devPath: '/dev/sdb',
      partitions: [
        expect.objectContaining<UsbPartitionInfo>({
          devPath: '/dev/sdb1',
          mount: { type: 'mounted', mountPoint: expect.any(String) },
        }),
      ],
    },
  ]);
});

test('stepwiseAddUsbDrive', () => {
  const usb = new SimulatedMultiUsbDrive();
  const steps = usb.stepwiseAddUsbDrive({}, { devPath: '/dev/sdb' });

  // Starts without any changes.
  expect(usb.multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([]);

  // Next the drive is connected but unmounted.
  steps.next();
  expect(usb.multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([
    {
      devPath: '/dev/sdb',
      partitions: [
        expect.objectContaining<UsbPartitionInfo>({
          devPath: '/dev/sdb1',
          mount: { type: 'unmounted' },
        }),
      ],
    },
  ]);

  // Next the drive is connected and mounting.
  steps.next();
  expect(usb.multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([
    {
      devPath: '/dev/sdb',
      partitions: [
        expect.objectContaining<UsbPartitionInfo>({
          devPath: '/dev/sdb1',
          mount: { type: 'mounting' },
        }),
      ],
    },
  ]);

  // Next the drive is mounted.
  steps.next();
  expect(usb.multiUsbDrive.getDrives()).toEqual<UsbDriveInfo[]>([
    {
      devPath: '/dev/sdb',
      partitions: [
        expect.objectContaining<UsbPartitionInfo>({
          devPath: '/dev/sdb1',
          mount: { type: 'mounted', mountPoint: expect.any(String) },
        }),
      ],
    },
  ]);

  // No more steps.
  expect(steps.next().done).toBeTruthy();
});
