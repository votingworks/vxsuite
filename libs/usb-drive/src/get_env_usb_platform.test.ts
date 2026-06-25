import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import { getEnvUsbPlatform } from './get_env_usb_platform';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform';
import { RealUsbPlatform } from './usb_platform';

const featureFlagMock = getFeatureFlagMock();

vi.mock(
  import('@votingworks/utils'),
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual()),
    isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
  })
);

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('returns a RealUsbPlatform by default', () => {
  expect(getEnvUsbPlatform()).toBeInstanceOf(RealUsbPlatform);
});

test('returns a SimulatedUsbPlatform when the mock flag is enabled', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );

  expect(getEnvUsbPlatform()).toBeInstanceOf(SimulatedUsbPlatform);
});
