import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { render, screen, waitFor } from '../test/react_testing_library.js';
import { App } from './app.js';
import { type ApiMock, createApiMock } from '../test/api.js';
import { mockBatch, mockStatus } from '../test/fixtures.js';

const electionDefinition = readElectionGeneralDefinition();
const pollWorkerRoleEnabledSettings: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  centralScanEnablePollWorkerRole: true,
};

let apiMock: ApiMock;

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();

  apiMock = createApiMock();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
  apiMock.expectGetMachineConfig();
  apiMock.setStatus();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('poll worker sees only Scan Ballots and Batch History', async () => {
  apiMock.expectGetSystemSettings(pollWorkerRoleEnabledSettings);
  apiMock.expectGetPollingPlaceId('23-polling-place');
  apiMock.expectGetTestMode(true);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);
  await apiMock.authenticateAsPollWorker(electionDefinition);

  await screen.findByRole('heading', { name: 'Scan Ballots' });
  screen.getByText('Test Ballot Mode');

  screen.getButton('Scan Ballots');
  screen.getButton('Batch History');
  expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();

  screen.getButton('Lock Machine');
  expect(screen.queryByText('Eject USB')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Batch History'));
  await screen.findByRole('heading', { name: 'Batch History' });
  userEvent.click(screen.getButton('Scan Ballots'));
  await screen.findByRole('heading', { name: 'Scan Ballots' });

  apiMock.expectLogOut();
  userEvent.click(screen.getButton('Lock Machine'));
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  await screen.findByText('VxCentralScan Locked');
});

test('poll worker is redirected away from election manager routes', async () => {
  window.history.replaceState({}, '', '/settings');
  apiMock.expectGetSystemSettings(pollWorkerRoleEnabledSettings);
  apiMock.expectGetPollingPlaceId('23-polling-place');
  apiMock.expectGetTestMode(false);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);
  await apiMock.authenticateAsPollWorker(electionDefinition);

  await screen.findByRole('heading', { name: 'Scan Ballots' });
  expect(window.location.pathname).toEqual('/scan');
  expect(
    screen.queryByRole('heading', { name: 'Settings' })
  ).not.toBeInTheDocument();

  window.history.pushState({}, '', '/hardware-diagnostics');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await waitFor(() => expect(window.location.pathname).toEqual('/scan'));
  screen.getByRole('heading', { name: 'Scan Ballots' });
  expect(
    screen.queryByRole('heading', { name: 'Diagnostics' })
  ).not.toBeInTheDocument();
});

test('poll worker can adjudicate a sheet that needs review', async () => {
  const images = [
    {
      imageUrl: 'mock-front-image',
      ballotBounds: { x: 0, y: 0, width: 1700, height: 2200 },
    },
    {
      imageUrl: 'mock-back-image',
      ballotBounds: { x: 0, y: 0, width: 1700, height: 2200 },
    },
  ] as const;
  apiMock.expectGetSystemSettings(pollWorkerRoleEnabledSettings);
  apiMock.expectGetPollingPlaceId('23-polling-place');
  apiMock.expectGetTestMode(false);
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.setStatus(
    mockStatus(
      {},
      { state: 'needsReview', batchId: 'batch-id', sheetId: 'sheet-id' }
    )
  );
  apiMock.expectGetSheetForReview('sheet-id', {
    sheetInterpretation: {
      type: 'NeedsReviewSheet',
      reasons: [{ type: AdjudicationReason.BlankBallot }],
    },
    images: [...images],
  });

  render(<App apiClient={apiMock.apiClient} />);
  await apiMock.authenticateAsPollWorker(
    electionDefinition,
    'VxCentralScan Locked',
    'Blank Ballot'
  );

  apiMock.expectRejectSheet();
  userEvent.click(screen.getButton('Confirm Ballot Removed'));
  apiMock.setStatus(
    mockStatus(
      { batches: [mockBatch({ id: 'batch-id', endedAt: undefined })] },
      {
        state: 'paused',
        batchId: 'batch-id',
        pauseReason: { type: 'review', sheetId: 'sheet-id' },
      }
    )
  );
  await screen.findByText('A ballot required review');
});

test('lock screen and invalid card screen mention poll worker when the poll worker role is enabled', async () => {
  apiMock.expectGetSystemSettings(pollWorkerRoleEnabledSettings);
  apiMock.expectGetPollingPlaceId('23-polling-place');
  apiMock.expectGetTestMode(false);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText(
    'Insert a poll worker or election manager card to unlock.'
  );

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await screen.findByText(
    'Use a valid poll worker, election manager, or system administrator card.'
  );
});

test("lock screen and invalid card screen don't mention poll worker when the poll worker role is disabled", async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetPollingPlaceId('23-polling-place');
  apiMock.expectGetTestMode(false);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('Insert an election manager card to unlock.');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await screen.findByText(
    'Use a valid election manager or system administrator card.'
  );
});

test('invalid card screen before a polling place is selected', async () => {
  apiMock.expectGetSystemSettings(pollWorkerRoleEnabledSettings);
  apiMock.expectGetPollingPlaceId(null);
  apiMock.expectGetTestMode(false);
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText(
    'Insert a poll worker or election manager card to unlock.'
  );

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_not_configured',
  });
  await screen.findByText(
    'This machine is unconfigured and cannot be unlocked with this card. Ask an election manager to select a polling place.'
  );
});
