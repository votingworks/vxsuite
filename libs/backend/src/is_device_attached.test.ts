import { mockOf } from '@votingworks/test-utils';
import { usb } from 'usb';
import { isDeviceAttached } from './is_device_attached';

jest.mock('usb', (): typeof import('usb') => {
  const actual = jest.requireActual('usb');
  return {
    ...actual,
    usb: {
      ...actual.usb,
      getDeviceList: jest.fn(),
    },
  };
});

test('isDeviceAttached', () => {
  const getDeviceListMock = mockOf(usb.getDeviceList);
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
