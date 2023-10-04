import type { PrecinctScannerStatus } from '@votingworks/scan-backend';

export function scannerStatus(
  props: Partial<PrecinctScannerStatus> = {}
): PrecinctScannerStatus {
  return {
    state: 'no_paper',
    ballotsCounted: 0,
    ...props,
  };
}
