import { isDeviceAttached } from '@votingworks/backend';

export const ACCESSIBLE_CONTROLLER_VENDOR_ID = 0x0d8c;
export const ACCESSIBLE_CONTROLLER_PRODUCT_ID = 0x0170;

export function isAccessibleControllerAttached(): boolean {
  return isDeviceAttached(
    (device) =>
      device.deviceDescriptor.idProduct === ACCESSIBLE_CONTROLLER_PRODUCT_ID &&
      device.deviceDescriptor.idVendor === ACCESSIBLE_CONTROLLER_VENDOR_ID
  );
}
