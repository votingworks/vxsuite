import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  ElectionDefinition,
  formatElectionHashes,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import {
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  advancePromises,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { assertDefined, DateWithoutTime } from '@votingworks/basics';
import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import {
  mockCardlessVoterAuth,
  mockPollWorkerAuth,
} from '../../test/helpers/mock_auth';
import { ApiProvider } from '../api_provider';
import { InsertedInvalidNewSheetScreen } from './inserted_invalid_new_sheet_screen';
import { InsertedPreprintedBallotScreen } from './inserted_preprinted_ballot_screen';
import { BallotReadyForReviewScreen } from './ballot_ready_for_review_screen';
import { BALLOT_REINSERTION_SCREENS } from '../ballot_reinsertion_flow';

const electionGeneralDefinition = readElectionGeneralDefinition();
const { election } = electionGeneralDefinition;

let apiMock: ApiMock;
const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(import('./inserted_invalid_new_sheet_screen.js'));
vi.mock(import('./inserted_preprinted_ballot_screen.js'));
vi.mock(import('./ballot_ready_for_review_screen.js'));

const MOCK_BALLOT_REINSERTION_FLOW_CONTENT = 'MockBallotReinsertionFlow';
vi.mock(import('../ballot_reinsertion_flow.js'), async (importActual) => ({
  ...(await importActual()),
  BallotReinsertionFlow: () => <div>MockBallotReinsertionFlow</div>,
}));

const MOCK_SECTION_SESSION_START_ID = 'MockSectionSessionStart';
const MockSectionSessionStart = vi.spyOn(
  pollWorkerComponents,
  'SectionSessionStart'
);

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();

  mockFeatureFlagger.resetFeatureFlags();

  MockSectionSessionStart.mockImplementation(() => (
    <div data-testid={MOCK_SECTION_SESSION_START_ID} />
  ));
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
        activateCardlessVoterSession={vi.fn()}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        hasVotes={false}
        isLiveMode={false}
        pollsState="polls_open"
        ballotsPrintedCount={0}
        machineConfig={mockMachineConfig()}
        precinctSelection={singlePrecinctSelectionFor(
          electionDefinition.election.precincts[0].id
        )}
        setVotes={vi.fn()}
        {...props}
      />
    </ApiProvider>
  );
}

test('renders PollWorkerScreen', () => {
  renderScreen();
  screen.getByText('Poll Worker Menu');
  screen.getByText(hasTextAcrossElements('Ballots Printed: 0'));
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

  await screen.findByText('Remove Card to Begin Voting Session');
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
  expect(screen.queryByText('Poll Worker Menu')).toBeNull();
});

test('renders session start section', async () => {
  const [precinct] = election.precincts;
  const [pollingPlace] = assertDefined(election.pollingPlaces);

  const activateCardlessVoterSession = vi.fn();
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  const pollingPlaceId = pollingPlace.id;

  renderScreen({
    activateCardlessVoterSession,
    pollingPlaceId,
    precinctSelection,
  });

  const props = expectSessionStartSection();
  expect(props).toEqual<pollWorkerComponents.SectionSessionStartProps>({
    disabled: false,
    election,
    onChooseBallotStyle: expect.any(Function),
    pollingPlaceId,
    precinctSelection,
  });
  expect(activateCardlessVoterSession).not.toHaveBeenCalled();

  apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
  act(() => props.onChooseBallotStyle('some-precinct', 'some-ballot-style'));
  await waitFor(apiMock.mockApiClient.assertComplete);

  expect(activateCardlessVoterSession).toHaveBeenCalledWith(
    'some-precinct',
    'some-ballot-style'
  );
});

const blockingStates: Array<{ state: SimpleServerStatus }> = [
  { state: 'ejecting_to_front' },
  { state: 'ejecting_to_rear' },
];

describe.each(blockingStates)(
  'buttons related to voter session are disabled when paper is ejecting in state: $state',
  ({ state }) => {
    const electionDefinition =
      electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const { election } = electionDefinition;

    test('ballot style picker is disabled', async () => {
      const precinct = election.precincts[0];
      const precinctSelection = singlePrecinctSelectionFor(precinct.id);
      apiMock.setPaperHandlerState(state);
      renderScreen({
        electionDefinition,
        activateCardlessVoterSession: vi.fn(),
        precinctSelection,
      });

      await waitFor(apiMock.mockApiClient.assertComplete);

      const props = expectSessionStartSection();
      expect(props.election).toEqual(election);
      expect(props.precinctSelection).toEqual(precinctSelection);
      expect(props.disabled).toEqual(true);
    });

    test('insert pre-printed ballot button is disabled', async () => {
      apiMock.setPaperHandlerState(state);
      renderScreen();

      const button = await screen.findButton(/insert printed ballot/i);
      expect(button).toBeDisabled();
    });
  }
);

describe('pre-printed ballots', () => {
  test('can insert pre-printed ballots', () => {
    renderScreen();

    apiMock.expectSetAcceptingPaperState(['InterpretedBmdPage']);
    userEvent.click(screen.getButton(/insert printed ballot/i));
  });

  const preprintedBallotInsertionStateContents: Partial<
    Record<SimpleServerStatus, string | RegExp>
  > = {
    accepting_paper: /feed one sheet of paper/i,
    loading_new_sheet: /loading sheet/i,
    validating_new_sheet: /loading sheet/i,
    inserted_invalid_new_sheet: 'MockInvalidNewSheetScreen',
    inserted_preprinted_ballot: 'MockValidPreprintedBallotScreen',
    presenting_ballot: 'MockReadyForReviewScreen',
  };

  for (const [stateMachineState, expectedContents] of Object.entries(
    preprintedBallotInsertionStateContents
  ) as Array<[SimpleServerStatus, string | RegExp]>) {
    test(`state machine state: ${stateMachineState}`, async () => {
      vi.mocked(InsertedInvalidNewSheetScreen).mockReturnValue(
        <p>MockInvalidNewSheetScreen</p>
      );
      vi.mocked(InsertedPreprintedBallotScreen).mockReturnValue(
        <p>MockValidPreprintedBallotScreen</p>
      );
      vi.mocked(BallotReadyForReviewScreen).mockReturnValue(
        <p>MockReadyForReviewScreen</p>
      );

      apiMock.setPaperHandlerState(stateMachineState);

      renderScreen();

      await screen.findByText(expectedContents);
    });
  }
});

describe('shows BallotReinsertionFlow for relevant states:', () => {
  test.each(Object.keys(BALLOT_REINSERTION_SCREENS))(
    `state: %s`,
    async (state) => {
      apiMock.setPaperHandlerState(state as SimpleServerStatus);

      const { container } = renderScreen();
      await advancePromises();

      expect(container).toHaveTextContent(MOCK_BALLOT_REINSERTION_FLOW_CONTENT);
    }
  );
});

test('Shows election info', () => {
  renderScreen();
  screen.getByText(election.title);
  screen.getByText(
    formatElectionHashes(
      electionGeneralDefinition.ballotHash,
      'test-election-package-hash'
    )
  );
});

function expectSessionStartSection() {
  screen.getByTestId(MOCK_SECTION_SESSION_START_ID);
  const props = MockSectionSessionStart.mock.lastCall?.[0];

  return assertDefined(props);
}
