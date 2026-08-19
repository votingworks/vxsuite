import { expect, test } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { Admin } from '@votingworks/types';
import type { MachineRecord } from '@votingworks/admin-backend';

import { renderInAppContext } from '../../../test/render_in_app_context.js';
import { ScannersTab } from './scanners_tab.js';
import { createApiMock } from '../../../test/helpers/mock_api_client.js';
import { screen, waitFor } from '../../../test/react_testing_library.js';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;
const [place1] = election.pollingPlaces;

function mockScanner(
  partial: Pick<MachineRecord, 'machineId'> & Partial<MachineRecord>
): MachineRecord {
  return {
    machineRole: 'scanner',
    status: Admin.ClientMachineStatus.Active,
    authType: null,
    pollingPlaceId: null,
    registrationError: null,
    lastSeenAt: Date.now(),
    ...partial,
  };
}

test('renders empty state while no scanners have connected', async () => {
  const api = createApiMock();
  api.expectGetNetworkStatus({ connectedScanners: [] });
  api.expectGetScannerImportCounts();

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
      }),
      mockScanner({
        machineId: 'CS-02',
        status: Admin.ClientMachineStatus.Offline,
      }),
      mockScanner({ machineId: 'CS-03', pollingPlaceId: 'not-a-real-place' }),
    ],
  });
  api.expectGetScannerImportCounts({
    'CS-01': { cvrCount: 1412, batchCount: 3 },
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

test('renders scanners in error states with the rejection reason', async () => {
  const api = createApiMock();
  api.expectGetNetworkStatus({
    connectedScanners: [
      mockScanner({
        machineId: 'CS-01',
        registrationError: 'code-version-mismatch',
      }),
      mockScanner({
        machineId: 'CS-02',
        registrationError: 'ballot-hash-mismatch',
      }),
      mockScanner({
        machineId: 'CS-03',
        registrationError: 'scanner-unconfigured',
      }),
      mockScanner({
        machineId: 'CS-04',
        registrationError: 'host-unconfigured',
      }),
      // Offline wins over a stale registration error
      mockScanner({
        machineId: 'CS-05',
        registrationError: 'code-version-mismatch',
        status: Admin.ClientMachineStatus.Offline,
      }),
    ],
  });
  api.expectGetScannerImportCounts();

  renderInAppContext(<ScannersTab />, { apiMock: api, electionDefinition });

  await waitFor(() => api.assertComplete());

  const rows = screen.getAllByRole('row').slice(1); // skip header
  expect(rows.map((row) => row.textContent)).toEqual([
    'CS-01— Incompatible Software00Now',
    'CS-02— Different Election00Now',
    'CS-03— Scanner Not Configured00Now',
    'CS-04— VxAdmin Not Configured00Now',
    'CS-05— Offline00Now',
  ]);
});
