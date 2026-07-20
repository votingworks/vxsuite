import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { constructElectionKey, ElectionDefinition } from '@votingworks/types';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
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

  await screen.findByText('Scan New Batch');
  expect(screen.getButton('Scan New Batch')).toBeEnabled();
  screen.getByText('Lock Machine');

  // No CVR management or batch deletion controls
  expect(screen.queryByText('Save CVRs')).not.toBeInTheDocument();
  expect(screen.queryByText('Send CVRs')).not.toBeInTheDocument();
  expect(screen.queryByText('Delete All Batches')).not.toBeInTheDocument();

  // No election manager navigation items
  expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
});

test('poll worker can toggle batch history, which has no delete buttons', async () => {
  apiMock.setStatus(
    mockStatus({
      batches: [
        mockBatch({ id: 'batch-1', label: 'Batch 1', count: 25 }),
        mockBatch({ id: 'batch-2', label: 'Batch 2', count: 32 }),
      ],
    })
  );
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetPollingPlaceId('central-scanning');
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan Locked');
  logInAsPollWorker(electionDefinition);

  // History is collapsed (hidden from the accessibility tree) by default;
  // stats are always visible
  await screen.findByText('Saved Batches:');
  screen.getByText('Total Sheets:');
  expect(
    screen.queryByRole('complementary', { name: 'Batch History' })
  ).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Show Batch History'));
  const historySheet = await screen.findByRole('complementary', {
    name: 'Batch History',
  });
  within(historySheet).getByText('Batch 1');
  within(historySheet).getByText('Batch 2');
  expect(screen.queryByText('Delete')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Close'));
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('complementary', { name: 'Batch History' })
    ).not.toBeInTheDocument();
  });
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
  expect(screen.getButton('Scan New Batch')).toBeDisabled();
});
