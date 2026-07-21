import { expect, test } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { Admin } from '@votingworks/types';
import type { ScannerMachineRecord } from '@votingworks/admin-backend';

import { renderInAppContext } from '../../../test/render_in_app_context';
import { ScannersTab } from './scanners_tab';
import { createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, waitFor } from '../../../test/react_testing_library';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;
const [place1] = election.pollingPlaces;

function mockScanner(
  partial: Pick<ScannerMachineRecord, 'machineId' | 'pollingPlaceId'> &
    Partial<ScannerMachineRecord>
): ScannerMachineRecord {
  return {
    machineMode: 'scanner',
    status: Admin.ClientMachineStatus.Active,
    authType: null,
    lastSeenAt: Date.now(),
    importedCvrCount: 0,
    importedBatchCount: 0,
    ...partial,
  };
}

test('renders empty state while no scanners have connected', async () => {
  const api = createApiMock();
  api.expectGetNetworkStatus({ connectedScanners: [] });

  renderInAppContext(<ScannersTab />, { apiMock: api, electionDefinition });

  await screen.findByText(/Waiting for central scanners to connect/);
});

test('renders a row per scanner with polling place and status', async () => {
  const api = createApiMock();
  api.expectGetNetworkStatus({
    connectedScanners: [
      mockScanner({
        machineId: 'CS-01',
        pollingPlaceId: place1.id,
        importedCvrCount: 1412,
        importedBatchCount: 3,
      }),
      mockScanner({
        machineId: 'CS-02',
        pollingPlaceId: null,
        status: Admin.ClientMachineStatus.Offline,
      }),
      mockScanner({ machineId: 'CS-03', pollingPlaceId: 'not-a-real-place' }),
    ],
  });

  renderInAppContext(<ScannersTab />, { apiMock: api, electionDefinition });

  await waitFor(() => api.assertComplete());

  const rows = screen.getAllByRole('row').slice(1); // skip header
  expect(rows.map((row) => row.textContent)).toEqual([
    `CS-01${place1.name} Connected1,4123Now`,
    'CS-02— Offline00Now',
    'CS-03not-a-real-place Connected00Now',
  ]);
});
