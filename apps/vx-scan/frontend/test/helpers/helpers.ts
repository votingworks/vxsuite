import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/vx-scan-backend';
import { CARD_POLLING_INTERVAL } from '../../src/config/globals';

export async function authenticateElectionManagerCard(): Promise<void> {
  jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  await screen.findByText('Election Manager Settings');
}

export function scannerStatus(
  props: Partial<PrecinctScannerStatus> = {}
): PrecinctScannerStatus {
  return {
    state: 'no_paper',
    ballotsCounted: 0,
    canUnconfigure: false,
    ...props,
  };
}
