import { LogEventId, BaseLogger } from '@votingworks/logging';
import { usb } from 'usb';

/**
 * Logs when devices are attached or detached.
 *
 * If we ever transition device connection from a polling model to an event-driven
 * model, we could handle subscribers here.
 */
export function detectDevices({ logger }: { logger: BaseLogger }): void {
  usb.on('attach', (device) => {
    void logger.log(LogEventId.DeviceAttached, 'system', {
      message: `Device attached. Vendor ID: ${device.deviceDescriptor.idVendor}, Product ID: ${device.deviceDescriptor.idProduct}`,
      productId: device.deviceDescriptor.idProduct,
      vendorId: device.deviceDescriptor.idVendor,
    });
  });

  usb.on('detach', (device) => {
    void logger.log(LogEventId.DeviceUnattached, 'system', {
      message: `Device unattached. Vendor ID: ${device.deviceDescriptor.idVendor}, Product ID: ${device.deviceDescriptor.idProduct}`,
      productId: device.deviceDescriptor.idProduct,
      vendorId: device.deviceDescriptor.idVendor,
    });
  });
}
