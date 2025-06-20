import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  constructElectionKey,
  ElectionDefinition,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import {
  singlePrecinctSelectionFor,
  generateBallotStyleId,
} from '@votingworks/utils';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { DateWithoutTime } from '@votingworks/basics';
import { fireEvent, screen } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { defaultPrecinctId } from '../../test/helpers/election';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiProvider } from '../api_provider';

const electionGeneralDefinition = readElectionGeneralDefinition();
const { election } = electionGeneralDefinition;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function mockPollWorkerAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: mockPollWorkerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };
}

function renderScreen(
  props: Partial<PollworkerScreenProps> = {},
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn = mockPollWorkerAuth(
    electionGeneralDefinition
  ),
  electionDefinition: ElectionDefinition = electionGeneralDefinition
) {
  return render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <PollWorkerScreen
        pollWorkerAuth={pollWorkerAuth}
        activateCardlessVoterSession={vi.fn()}
        resetCardlessVoterSession={vi.fn()}
        appPrecinct={singlePrecinctSelectionFor(defaultPrecinctId)}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        hasVotes={false}
        isLiveMode={false}
        pollsState="polls_open"
        ballotsPrintedCount={0}
        machineConfig={mockMachineConfig()}
        reload={vi.fn()}
        {...props}
      />
    </ApiProvider>
  );
}

test('renders PollWorkerScreen', () => {
  renderScreen(undefined, undefined, undefined);
  screen.getByText('Poll Worker Menu');
  expect(
    screen.getByText('Ballots Printed:').parentElement!.textContent
  ).toEqual('Ballots Printed: 0');
});

test('switching out of test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...election,
    date: DateWithoutTime.today(),
  });
  apiMock.expectSetTestMode(false);
  renderScreen({
    pollWorkerAuth: mockPollWorkerAuth(electionDefinition),
    electionDefinition,
  });

  screen.getByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  userEvent.click(screen.getByText('Switch to Official Ballot Mode'));
});

test('keeping test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...election,
    date: DateWithoutTime.today(),
  });
  renderScreen({ electionDefinition });

  screen.getByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(screen.getByText('Cancel'));
});

test('live mode on election day', () => {
  renderScreen({ isLiveMode: true });
  expect(
    screen.queryByText(
      'Switch to Official Ballot Mode and reset the Ballots Printed count?'
    )
  ).toBeNull();
});

test('navigates to Diagnostics screen', () => {
  const { unmount } = renderScreen();

  userEvent.click(screen.getByRole('button', { name: 'View More Actions' }));
  userEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
  screen.getByRole('heading', { name: 'Diagnostics' });

  userEvent.click(
    screen.getByRole('button', { name: 'Back to Poll Worker Actions' })
  );
  screen.getByText(hasTextAcrossElements('Polls: Open'));

  // Explicitly unmount before the printer status has resolved to verify that
  // we properly cancel the request for printer status.
  unmount();
});

test('can toggle between vote activation and "other actions" during polls open', async () => {
  renderScreen({
    pollsState: 'polls_open',
    machineConfig: mockMachineConfig(),
  });

  // confirm we start with polls open
  await screen.findByText(hasTextAcrossElements('Select Voter’s Ballot Style'));

  // switch to other actions pane
  userEvent.click(screen.getByText('View More Actions'));
  screen.getByText('Diagnostics');

  // switch back
  userEvent.click(screen.getByText('Back to Ballot Style Selection'));
  screen.getByText('Select Voter’s Ballot Style');
});

test('displays only default English ballot styles', async () => {
  const baseElection = electionGeneralDefinition.election;

  const ballotLanguages = ['en', 'es-US'];
  const [ballotStyleEnglish, ballotStyleSpanish] = ballotLanguages.map((l) => ({
    ...baseElection.ballotStyles[0],
    id: generateBallotStyleId({ ballotStyleIndex: 1, languages: [l] }),
    languages: [l],
  }));

  const electionDefinition: ElectionDefinition = {
    ...electionGeneralDefinition,
    election: {
      ...baseElection,
      ballotStyles: [ballotStyleEnglish, ballotStyleSpanish],
    },
  };
  renderScreen({
    pollsState: 'polls_open',
    machineConfig: mockMachineConfig(),
    pollWorkerAuth: mockPollWorkerAuth(electionDefinition),
    electionDefinition,
  });

  await screen.findByText(hasTextAcrossElements('Select Voter’s Ballot Style'));

  screen.getButton(ballotStyleEnglish.groupId);
  expect(
    screen.queryByRole('button', { name: ballotStyleSpanish.id })
  ).not.toBeInTheDocument();
});
