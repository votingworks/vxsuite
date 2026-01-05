import { isDeviceAttached } from '@votingworks/backend';
import { getMockPatInputConnected } from './mock_pat_input';
import { getMockAccessibleControllerConnected } from './mock_accessible_controller';

export const ACCESSIBLE_CONTROLLER_VENDOR_ID = 0x0d8c;
export const ACCESSIBLE_CONTROLLER_PRODUCT_ID = 0x0170;

export const PAT_INPUT_VENDOR_ID = 0x05f3;
export const PAT_INPUT_PRODUCT_ID = 0x04c8;

export function isAccessibleControllerAttached(): boolean {
  // Allow dev override via dev-dock connected state
  if (getMockAccessibleControllerConnected()) {
    return true;
  }
  return isDeviceAttached(
    (device) =>
      device.deviceDescriptor.idProduct === ACCESSIBLE_CONTROLLER_PRODUCT_ID &&
      device.deviceDescriptor.idVendor === ACCESSIBLE_CONTROLLER_VENDOR_ID
  );
}

export function isPatInputAttached(): boolean {
  // Allow dev override via dev-dock connected state
  if (getMockPatInputConnected()) {
    return true;
  }

  return isDeviceAttached(
    (device) =>
      device.deviceDescriptor.idProduct === PAT_INPUT_PRODUCT_ID &&
      device.deviceDescriptor.idVendor === PAT_INPUT_VENDOR_ID
  );
}
