import { expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { isNetworkingEnabled } from '@votingworks/networking';
import { isMultiStationAdjudicationEnabled } from './multi_station_config.js';

vi.mock(import('@votingworks/networking'), async (importActual) => ({
  ...(await importActual()),
  isNetworkingEnabled: vi.fn(),
}));

test('delegates to isNetworkingEnabled with the multi-station flag', () => {
  vi.mocked(isNetworkingEnabled).mockReturnValue(true);
  expect(isMultiStationAdjudicationEnabled()).toEqual(true);
  expect(isNetworkingEnabled).toHaveBeenCalledWith(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  vi.mocked(isNetworkingEnabled).mockReturnValue(false);
  expect(isMultiStationAdjudicationEnabled()).toEqual(false);
});
