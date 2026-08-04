import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  asElectionDefinition,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { DateWithoutTime } from '@votingworks/basics';
import { anyPollingPlace } from '@votingworks/types';
import { render, screen } from '../test/react_testing_library.js';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client.js';
import { App } from './app.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Prompts to change from test mode to live mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...readElectionGeneral(),
    date: DateWithoutTime.today(),
  });
  const pollingPlace = anyPollingPlace(electionDefinition.election);

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    isTestMode: true,
    pollingPlaceId: pollingPlace.id,
  });
  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('Test Ballot Mode');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  apiMock.expectSetTestMode(false);
  apiMock.expectGetElectionState({
    isTestMode: false,
  });
  userEvent.click(
    screen.getByRole('button', { name: 'Switch to Official Ballot Mode' })
  );
  await vi.waitFor(() =>
    expect(screen.queryByText('Test Ballot Mode')).toBeNull()
  );
});
