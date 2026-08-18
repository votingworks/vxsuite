import { isNetworkingEnabled } from '@votingworks/networking';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';

/**
 * Multi-station adjudication is enabled only when both the
 * REACT_APP_VX_ENABLE_MULTI_STATION_ADMIN feature flag is set AND (in
 * production) the machine-level networking toggle is on. See
 * {@link isNetworkingEnabled} for the details of the machine-level check.
 */
export function isMultiStationAdjudicationEnabled(): boolean {
  return isNetworkingEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );
}
