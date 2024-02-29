import { usb } from 'usb';

/**
 * Checks whether a device is attached or not.
 */
export function isDeviceAttached(
  isDevice: (device: usb.Device) => boolean
): boolean {
  return usb.getDeviceList().some(isDevice);
}
