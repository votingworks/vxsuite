import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getRequiredEnvVar, isNodeEnvProduction } from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

const LOCAL_ETHERNET_STATE_FILENAME = 'local-ethernet-state';

/**
 * Multi-station adjudication is enabled only when both:
 *   1. The REACT_APP_VX_ENABLE_MULTI_STATION_ADMIN feature flag is set, AND
 *   2. In production, $VX_CONFIG_ROOT/local-ethernet-state exists with the
 *      content "enable". In non-production environments the file check is
 *      skipped (treated as enabled) since /vx/config doesn't exist on dev
 *      machines.
 *
 * The file lets ops toggle the feature on a built machine without a rebuild —
 * editing the file and rebooting picks up the new value at process start.
 */
export function isMultiStationAdjudicationEnabled(): boolean {
  if (
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
    )
  ) {
    return false;
  }
  if (!isNodeEnvProduction()) {
    return true;
  }
  try {
    return (
      readFileSync(
        path.join(
          getRequiredEnvVar('VX_CONFIG_ROOT'),
          LOCAL_ETHERNET_STATE_FILENAME
        ),
        'utf-8'
      ).trim() === 'enable'
    );
  } catch {
    return false;
  }
}
