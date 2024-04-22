import {
  asElectionDefinition,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  ElectionDefinition,
  InsertedSmartCardAuth,
  LanguageCode,
} from '@votingworks/types';

import {
  BooleanEnvironmentVariableName,
  generateBallotStyleId,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { DateWithoutTime } from '@votingworks/basics';
import { fireEvent, screen } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import {
  mockCardlessVoterAuth,
  mockPollWorkerAuth,
} from '../../test/helpers/mock_auth';
import { ApiProvider } from '../api_provider';

const { election } = electionGeneralDefinition;

let apiMock: ApiMock;
const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(
  props: Partial<PollworkerScreenProps> = {},
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn = mockPollWorkerAuth(
    electionGeneralDefinition
  ),
  electionDefinition: ElectionDefinition = electionGeneralDefinition
) {
  return render(
    <ApiProvider apiClient={apiMock.mockApiClient}>
      <PollWorkerScreen
        pollWorkerAuth={pollWorkerAuth}
        activateCardlessVoterSession={jest.fn()}
        resetCardlessVoterSession={jest.fn()}
        electionDefinition={electionDefinition}
        hasVotes={false}
        isLiveMode={false}
        pollsState="polls_open"
        ballotsPrintedCount={0}
        machineConfig={mockMachineConfig()}
        precinctSelection={singlePrecinctSelectionFor(
          electionDefinition.election.precincts[0].id
        )}
        {...props}
      />
    </ApiProvider>
  );
}

test('renders PollWorkerScreen', () => {
  renderScreen();
  screen.getByText('Poll Worker Actions');
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

test('can toggle between vote activation and "other actions" during polls open', async () => {
  renderScreen({
    pollsState: 'polls_open',
    machineConfig: mockMachineConfig(),
  });

  // confirm we start with polls open
  await screen.findByText(hasTextAcrossElements('Select Voter’s Ballot Style'));

  // switch to other actions pane
  userEvent.click(screen.getByText('View More Actions'));
  screen.getByText('Reset Accessible Controller');

  // switch back
  userEvent.click(screen.getByText('Back to Ballot Style Selection'));
  screen.getByText('Select Voter’s Ballot Style');
});

test('returns instruction page if status is `waiting_for_ballot_data`', async () => {
  const electionDefinition = electionGeneralDefinition;
  const pollWorkerAuth = mockCardlessVoterAuth(electionDefinition);
  apiMock.setPaperHandlerState('waiting_for_ballot_data');

  renderScreen({
    pollsState: 'polls_open',
    pollWorkerAuth,
    machineConfig: mockMachineConfig(),
    electionDefinition,
  });

  await screen.findByText('Paper has been loaded.');
});

test('returns null if status is unhandled', () => {
  const electionDefinition = electionGeneralDefinition;
  const pollWorkerAuth = mockCardlessVoterAuth(electionDefinition);
  apiMock.setPaperHandlerState('scanning');

  renderScreen({
    pollsState: 'polls_open',
    pollWorkerAuth,
    machineConfig: mockMachineConfig(),
    electionDefinition,
  });

  expect(screen.queryByText('Paper has been loaded.')).toBeNull();
  expect(screen.queryByText('Poll Worker Actions')).toBeNull();
});

test('renders a warning screen when hardware check is off', async () => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );

  const electionDefinition = electionGeneralDefinition;
  const pollWorkerAuth = mockCardlessVoterAuth(electionDefinition);
  apiMock.setPaperHandlerState('no_hardware');

  renderScreen({
    pollsState: 'polls_open',
    pollWorkerAuth,
    machineConfig: mockMachineConfig(),
    electionDefinition,
  });

  await screen.findByText('Hardware Check Disabled');
});

test('displays only default English ballot styles', async () => {
  const baseElection = electionGeneralDefinition.election;

  const ballotLanguages = [LanguageCode.ENGLISH, LanguageCode.SPANISH];
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

  screen.getButton(ballotStyleEnglish.id);
  expect(
    screen.queryByRole('button', { name: ballotStyleSpanish.id })
  ).not.toBeInTheDocument();
});
