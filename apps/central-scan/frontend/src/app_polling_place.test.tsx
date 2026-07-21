import { afterEach, beforeEach, expect, test } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { constructElectionKey, ElectionDefinition } from '@votingworks/types';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/api';

// The famous names fixture defines a 'central-scanning' absentee polling place.
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
  apiMock.setStatus();
  apiMock.expectGetTestMode(false);
});

afterEach(() => {
  apiMock.assertComplete();
});

function logInAsElectionManager(electionForKey: ElectionDefinition) {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionForKey.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

test('warns and disables scanning when no polling place is selected', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetPollingPlaceId(null);
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan Locked');
  logInAsElectionManager(electionDefinition);

  await screen.findByText(/No polling place selected/);
  expect(screen.getButton('Start Batch 1')).toBeDisabled();

  // The user can navigate to the settings screen to select a polling place.
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Polling Place' });
});

test('does not warn when a polling place is already selected', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetPollingPlaceId('central-scanning');
  render(<App apiClient={apiMock.apiClient} />);

  await screen.findByText('VxCentralScan Locked');
  logInAsElectionManager(electionDefinition);

  await screen.findByText('Start Batch 1');
  expect(screen.getButton('Start Batch 1')).toBeEnabled();
  expect(
    screen.queryByText(/No polling place selected/)
  ).not.toBeInTheDocument();
});
