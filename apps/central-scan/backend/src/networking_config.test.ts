import { expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { isNetworkingEnabled } from '@votingworks/networking';
import { isCentralScanNetworkingEnabled } from './networking_config.js';

vi.mock(import('@votingworks/networking'), async (importActual) => ({
  ...(await importActual()),
  isNetworkingEnabled: vi.fn(),
}));

test('delegates to isNetworkingEnabled with the central-scan flag', () => {
  vi.mocked(isNetworkingEnabled).mockReturnValue(true);
  expect(isCentralScanNetworkingEnabled()).toEqual(true);
  expect(isNetworkingEnabled).toHaveBeenCalledWith(
    BooleanEnvironmentVariableName.ENABLE_CENTRAL_SCAN_NETWORKING
  );

  vi.mocked(isNetworkingEnabled).mockReturnValue(false);
  expect(isCentralScanNetworkingEnabled()).toEqual(false);
});
