import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { getMockUsbDirPath } from './mocks/file_usb_drive';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform';
import { RealUsbPlatform } from './usb_platform';
import { UsbPlatform } from './usb_platform_types';

/**
 * Gets the appropriate USB platform based on the environment.
 */
export function getEnvUsbPlatform(): UsbPlatform {
  return isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)
    ? new SimulatedUsbPlatform(getMockUsbDirPath())
    : new RealUsbPlatform();
}
