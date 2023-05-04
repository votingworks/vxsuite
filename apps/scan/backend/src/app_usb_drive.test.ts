import { withApp } from '../test/helpers/custom_helpers';

test('getUsbDriveStatus', async () => {
  await withApp({}, async ({ apiClient, mockUsbDrive }) => {
    mockUsbDrive.removeUsbDrive();
    await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
      status: 'no_drive',
    });
    mockUsbDrive.insertUsbDrive({});
    await expect(apiClient.getUsbDriveStatus()).resolves.toEqual({
      status: 'mounted',
      mountPoint: expect.any(String),
      deviceName: 'mock-usb-drive',
    });
  });
});

test('ejectUsbDrive', async () => {
  await withApp({}, async ({ apiClient, mockUsbDrive }) => {
    mockUsbDrive.usbDrive.eject.expectCallWith().resolves();
    await expect(apiClient.ejectUsbDrive()).resolves.toBeUndefined();
  });
});
