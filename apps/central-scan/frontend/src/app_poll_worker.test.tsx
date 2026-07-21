import { afterEach, beforeEach, expect, test } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { constructElectionKey, ElectionDefinition } from '@votingworks/types';
import {
  hasTextAcrossElements,
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/api';
import { mockBatch, mockStatus } from '../test/fixtures';

const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  // Reset the URL since navigation in one test persists into the next.
  window.history.replaceState({}, '', '/');
  apiMock = createApiMock();
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  apiMock.setUsbDriveStatus({ status: 'no_drive' });
  apiMock.expectGetSystemSettings();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetTestMode(false);
});

afterEach(() => {
  apiMock.assertComplete();
});

function logInAsPollWorker(electionForKey: ElectionDefinition) {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockPollWorkerUser({
      electionKey: constructElectionKey(electionForKey.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

test('poll worker sees the simplified batch scanning screen', async () => {
  apiMock.setStatus();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetPollingPlaceId('central-scanning');
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan Locked');
  screen.getByText('Insert a poll worker or election manager card to unlock.');
  logInAsPollWorker(electionDefinition);

  await screen.findByText('Start Batch 1');
  expect(screen.getButton('Start Batch 1')).toBeEnabled();
  screen.getByText('Lock Machine');

  // No CVR management or batch deletion controls
  expect(screen.queryByText('Save CVRs')).not.toBeInTheDocument();
  expect(screen.queryByText('Send CVRs')).not.toBeInTheDocument();
  expect(screen.queryByText('Delete All Batches')).not.toBeInTheDocument();

  // No election manager navigation items
  expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
});

test('poll worker can open batch history, which has no delete buttons', async () => {
  apiMock.setStatus(
    mockStatus({
      batches: [
        mockBatch({
          id: 'batch-1',
          batchNumber: 1,
          label: 'Batch 1',
          count: 25,
        }),
        mockBatch({
          id: 'batch-2',
          batchNumber: 2,
          label: 'Batch 2',
          count: 32,
        }),
      ],
      nextBatchNumber: 3,
    })
  );
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetPollingPlaceId('central-scanning');
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan Locked');
  logInAsPollWorker(electionDefinition);

  // Summary stats are always visible; the line-by-line history lives on its
  // own page
  await screen.findByText(hasTextAcrossElements('Total Batches: 2'));
  screen.getByText(hasTextAcrossElements('Total Sheets: 57'));

  userEvent.click(screen.getByText('Batch History'));
  await screen.findByRole('heading', { name: 'Batch History' });
  screen.getByText('Batch 1');
  screen.getByText('Batch 2');
  // totals are shown on the history page too
  screen.getByText(hasTextAcrossElements('Total Batches: 2'));
  expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  expect(screen.queryByText('Delete All Batches')).not.toBeInTheDocument();
  expect(screen.queryByText('Save CVRs')).not.toBeInTheDocument();

  userEvent.click(screen.getByText('Scan Ballots'));
  await screen.findByText('Start Batch 3');
});

test('poll worker is warned when no polling place is selected', async () => {
  apiMock.setStatus();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetPollingPlaceId(null);
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan Locked');
  logInAsPollWorker(electionDefinition);

  await screen.findByText(/No polling place selected/);
  screen.getByText(/Ask an election manager/);
  expect(screen.getButton('Start Batch 1')).toBeDisabled();
});
