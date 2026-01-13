import type { PrecinctScannerStatus } from '@votingworks/scan-backend';

export function scannerStatus(
  props: Partial<PrecinctScannerStatus> = {}
): PrecinctScannerStatus {
  return {
    state: 'waiting_for_ballot',
    ballotsCounted: 0,
    ...props,
  };
}
