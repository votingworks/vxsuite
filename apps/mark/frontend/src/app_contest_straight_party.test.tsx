import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { anyPollingPlace } from '@votingworks/types';
import {
  asElectionDefinition,
  readElectionStraightParty,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
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

  // Advancing to the first candidate contest shows the party's candidate as a
  // derived selection that fills the single seat.
  userEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises();
  screen.getByRole('heading', { name: /President/i });
  const candidateButton = screen
    .getByText('Joseph Barchi and Joseph Hallaren')
    .closest('button')!;
  expect(candidateButton).toHaveAttribute('aria-selected', 'true');
  within(candidateButton).getByText(/straight party vote/i);
  screen.getByText(
    hasTextAcrossElements(/votes remaining in this contest: 0/i)
  );

  // Going back to the straight party contest, the selection persists.
  userEvent.click(screen.getByText('Back'));
  await advanceTimersAndPromises();
  screen.getByRole('heading', { name: 'Straight Party' });

  // Deselecting the party clears the selection
  userEvent.click(
    screen.getByRole('option', { name: /Federalist Party/, selected: true })
  );
  await advanceTimersAndPromises();
  screen.getByRole('option', { name: /Federalist Party/, selected: false });

  // Selecting a different party changes which candidate is derived
  userEvent.click(screen.getByText('Liberty Party'));
  await advanceTimersAndPromises();
  screen.getByRole('option', { name: /Liberty Party/, selected: true });

  userEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises();
  screen.getByRole('heading', { name: /President/i });
  expect(
    screen.getByText('Daniel Court and Amy Blumhardt').closest('button')
  ).toHaveAttribute('aria-selected', 'true');
  expect(
    screen.getByText('Joseph Barchi and Joseph Hallaren').closest('button')
  ).toHaveAttribute('aria-selected', 'false');
});
