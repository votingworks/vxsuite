import { afterEach, beforeEach, test, vi } from 'vitest';

import { anyPollingPlace } from '@votingworks/types';
import {
  asElectionDefinition,
  readElectionStraightParty,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

const election = readElectionStraightParty();
const electionDefinition = asElectionDefinition(election);
const pollingPlace = anyPollingPlace(election);
const [precinctId] = Object.keys(pollingPlace.precincts);

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
});

afterEach(async () => {
  await vi.waitFor(() => {
    apiMock.mockApiClient.assertComplete();
  });
});

test('voting and changing a straight party contest', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionState({
    pollingPlaceId: pollingPlace.id,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  userEvent.click(await screen.findByText('Start Voting'));
  await advanceTimersAndPromises();
  screen.getByRole('heading', { name: 'Straight Party' });

  // Select a party
  userEvent.click(screen.getByText('Federalist Party'));
  await advanceTimersAndPromises();
  screen.getByRole('option', { name: /Federalist Party/, selected: true });

  // Selecting a different party is blocked until the first is deselected
  userEvent.click(screen.getByText('Liberty Party'));
  await advanceTimersAndPromises();
  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);
  userEvent.click(screen.getByText('Continue'));
  await advanceTimersAndPromises();
  screen.getByRole('option', { name: /Liberty Party/, selected: false });

  // Deselecting the party clears the selection
  userEvent.click(
    screen.getByRole('option', { name: /Federalist Party/, selected: true })
  );
  await advanceTimersAndPromises();
  screen.getByRole('option', { name: /Federalist Party/, selected: false });
});
