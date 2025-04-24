import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  ElectionDefinition,
  formatElectionHashes,
  hasSplits,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import {
  ALL_PRECINCTS_SELECTION,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  advancePromises,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { assert, DateWithoutTime } from '@votingworks/basics';
import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { fireEvent, screen, waitFor } from '../../test/react_testing_library';

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

describe('start voter session with blank sheet: general election', () => {
  const electionDefinition = electionGeneralDefinition;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { election } = electionDefinition;

  test('single precinct configuration', async () => {
    const precinct = election.precincts[0];
    const ballotStyle = election.ballotStyles[0];
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
    });
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getButton(`Start Voting Session: ${precinct.name}`));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledWith(
      precinct.id,
      ballotStyle.id
    );
  });

  test('single precinct configuration with splits', async () => {
    const precinct = election.precincts[1];
    assert(hasSplits(precinct));
    const [ballotStyle1, ballotStyle2] = election.ballotStyles;
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
    });
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(precinct.splits[0].name));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      ballotStyle2.id
    );

    // Reopen dropdown to select another option. (Normally activating the session
    // would navigate away from the screen, so this is just a shortcut for
    // testing, not a realistic flow)
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText(precinct.splits[0].name));
    userEvent.click(screen.getByText(precinct.splits[1].name));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledTimes(2)
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      ballotStyle1.id
    );
  });

  test('all precincts configuration', async () => {
    const [precinct1, precinct2] = election.precincts;
    assert(hasSplits(precinct2));
    const [ballotStyle1, ballotStyle2] = election.ballotStyles;
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(precinct1.name));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct1.id,
      ballotStyle1.id
    );

    // Reopen dropdown to select another option. (Normally activating the session
    // would navigate away from the screen, so this is just a shortcut for
    // testing, not a realistic flow)
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText(precinct1.name));
    userEvent.click(screen.getByText(precinct2.splits[0].name));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct2.id,
      ballotStyle2.id
    );

    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText(precinct2.splits[0].name));
    userEvent.click(screen.getByText(precinct2.splits[1].name));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledTimes(2)
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct2.id,
      ballotStyle1.id
    );
  });
});

describe('start voter session with blank sheet: primary election', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { election } = electionDefinition;

  test('single precinct configuration', async () => {
    const precinct = election.precincts[0];
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
    });
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    screen.getByText('Select ballot style:');
    screen.getButton('Fish');
    userEvent.click(screen.getButton('Mammal'));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledWith(
      precinct.id,
      '1-Ma_en'
    );
  });

  test('single precinct configuration with splits', async () => {
    const [, , , precinct] = election.precincts;
    assert(hasSplits(precinct));
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      precinctSelection: singlePrecinctSelectionFor(precinct.id),
    });
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText("Select voter's precinct…"));
    userEvent.click(screen.getByText(precinct.splits[0].name));
    screen.getByText('Select ballot style:');
    screen.getButton('Fish');
    userEvent.click(screen.getButton('Mammal'));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      '3-Ma_en'
    );

    // Reopen dropdown to select another option. (Normally activating the session
    // would navigate away from the screen, so this is just a shortcut for
    // testing, not a realistic flow)
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText(precinct.splits[0].name));
    userEvent.click(screen.getByText(precinct.splits[1].name));
    screen.getByText('Select ballot style:');
    userEvent.click(screen.getButton('Fish'));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledTimes(2)
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      '4-F_en'
    );
  });

  test('all precincts configuration', async () => {
    const [precinct1, , , precinct4] = election.precincts;
    assert(hasSplits(precinct4));
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      precinctSelection: ALL_PRECINCTS_SELECTION,
    });
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText("Select voter's precinct…"));
    userEvent.click(screen.getByText(precinct1.name));
    userEvent.click(screen.getButton('Mammal'));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct1.id,
      '1-Ma_en'
    );

    // Reopen dropdown to select another option. (Normally activating the session
    // would navigate away from the screen, so this is just a shortcut for
    // testing, not a realistic flow)
    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText(precinct1.name));
    userEvent.click(screen.getByText(precinct4.splits[0].name));
    userEvent.click(screen.getButton('Mammal'));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce()
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct4.id,
      '3-Ma_en'
    );

    apiMock.expectSetAcceptingPaperState(['BlankPage', 'InterpretedBmdPage']);
    userEvent.click(screen.getByText(precinct4.splits[0].name));
    userEvent.click(screen.getByText(precinct4.splits[1].name));
    userEvent.click(screen.getButton('Fish'));
    await waitFor(() =>
      expect(activateCardlessVoterSessionMock).toHaveBeenCalledTimes(2)
    );
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct4.id,
      '4-F_en'
    );
  });
});

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
