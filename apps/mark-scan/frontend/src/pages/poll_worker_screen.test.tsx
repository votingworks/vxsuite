import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  ElectionDefinition,
  formatElectionHashes,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import {
  generateBallotStyleId,
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

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();

  mockFeatureFlagger.resetFeatureFlags();
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
describe('pre-printed ballots', () => {
  test('start new session with blank sheet', () => {
    renderScreen({ electionDefinition: electionGeneralDefinition });

    const ballotStyle = assertDefined(
      electionGeneralDefinition.election.ballotStyles[0]
    );
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);

    userEvent.click(screen.getButton(ballotStyle.groupId));
  });

  test('can insert pre-printed ballots without ballot style selection', () => {
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
  for (const state of Object.keys(BALLOT_REINSERTION_SCREENS)) {
    test(state, async () => {
      apiMock.setPaperHandlerState(state as SimpleServerStatus);

      const { container } = renderScreen();
      await advancePromises();

      expect(container).toHaveTextContent(MOCK_BALLOT_REINSERTION_FLOW_CONTENT);
    });
  }
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
