import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { usb } from 'usb';
import { detectDevices } from './detect_devices';

test('detectDevices', () => {
  const logger = mockBaseLogger();

  detectDevices({ logger });

  const device = {
    deviceDescriptor: {
      idVendor: 1,
      idProduct: 2,
    },
  } as unknown as usb.Device;

  usb.emit('attach', device);
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceAttached,
    'system',
    {
      message: 'Device attached. Vendor ID: 1, Product ID: 2',
      productId: 2,
      vendorId: 1,
    }
  );

  usb.emit('detach', device);
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    {
      message: 'Device unattached. Vendor ID: 1, Product ID: 2',
      productId: 2,
      vendorId: 1,
    }
  );
});
