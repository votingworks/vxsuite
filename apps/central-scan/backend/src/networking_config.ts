import { isNetworkingEnabled } from '@votingworks/networking';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';

/**
 * Networking on VxCentralScan is enabled only when both the
 * REACT_APP_VX_ENABLE_CENTRAL_SCAN_NETWORKING feature flag is set AND (in
 * production) the machine-level networking toggle is on. See
 * {@link isNetworkingEnabled} for the details of the machine-level check.
 */
export function isCentralScanNetworkingEnabled(): boolean {
  return isNetworkingEnabled(
    BooleanEnvironmentVariableName.ENABLE_CENTRAL_SCAN_NETWORKING
  );
}
