import { expect, test, vi } from 'vitest';
import { usb } from 'usb';
import { isDeviceAttached } from './is_device_attached';

vi.mock(import('usb'), async (importActual): Promise<typeof import('usb')> => {
  const actual = await importActual();
  return {
    ...actual,
    usb: {
      ...actual.usb,
      getDeviceList: vi.fn(),
    },
  };
});

test('isDeviceAttached', () => {
  const getDeviceListMock = vi.mocked(usb.getDeviceList);
  const devices = [
    {
      deviceDescriptor: {
        idVendor: 1,
        idProduct: 2,
      },
    },
    {
      deviceDescriptor: {
        idVendor: 1,
        idProduct: 3,
      },
    },
    {
      deviceDescriptor: {
        idVendor: 3,
        idProduct: 4,
      },
    },
  ] as unknown as usb.Device[];

  getDeviceListMock.mockReturnValue(devices);

  expect(
    isDeviceAttached(
      (device) =>
        device.deviceDescriptor.idVendor === 1 &&
        device.deviceDescriptor.idProduct === 2
    )
  ).toEqual(true);

  expect(
    isDeviceAttached(
      (device) =>
        device.deviceDescriptor.idVendor === 3 &&
        device.deviceDescriptor.idProduct === 4
    )
  ).toEqual(true);

  expect(
    isDeviceAttached((device) => device.deviceDescriptor.idVendor === 1)
  ).toEqual(true);

  expect(
    isDeviceAttached(
      (device) =>
        device.deviceDescriptor.idVendor === 1 &&
        device.deviceDescriptor.idProduct === 4
    )
  ).toEqual(false);
});
