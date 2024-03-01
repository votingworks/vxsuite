import { BaseLogger, LogEventId } from '@votingworks/logging';
import { usb } from 'usb';

/**
 * Test harness for app that uses `detectDevices`, to confirm it logs device
 * events.
 */
export function testDetectDevices(logger: BaseLogger): void {
  const device = {
    deviceDescriptor: {
      idVendor: 1,
      idProduct: 2,
    },
  } as unknown as usb.Device;

  usb.emit('attach', device);
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
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.DeviceUnattached,
    'system',
    {
      message: 'Device unattached. Vendor ID: 1, Product ID: 2',
      productId: 2,
      vendorId: 1,
    }
  );
}
