import { LogEventId, BaseLogger } from '@votingworks/logging';
import { usb } from 'usb';

/**
 * Logs when devices are attached or detached. Returns a cleanup function that
 * removes the listeners from the global USB event emitter.
 */
export function detectDevices({ logger }: { logger: BaseLogger }): () => void {
  function onAttach(device: usb.Device) {
    logger.log(LogEventId.DeviceAttached, 'system', {
      message: `Device attached. Vendor ID: ${device.deviceDescriptor.idVendor}, Product ID: ${device.deviceDescriptor.idProduct}`,
      productId: device.deviceDescriptor.idProduct,
      vendorId: device.deviceDescriptor.idVendor,
    });
  }

  function onDetach(device: usb.Device) {
    logger.log(LogEventId.DeviceUnattached, 'system', {
      message: `Device unattached. Vendor ID: ${device.deviceDescriptor.idVendor}, Product ID: ${device.deviceDescriptor.idProduct}`,
      productId: device.deviceDescriptor.idProduct,
      vendorId: device.deviceDescriptor.idVendor,
    });
  }

  usb.on('attach', onAttach);
  usb.on('detach', onDetach);

  return () => {
    usb.off('attach', onAttach);
    usb.off('detach', onDetach);
  };
}
