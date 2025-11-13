import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  constructElectionKey,
  ElectionDefinition,
  formatElectionHashes,
  hasSplits,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import {
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
} from '@votingworks/utils';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { assert, DateWithoutTime } from '@votingworks/basics';
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
  screen.getByText('Power Down');
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

describe('start voter session: general election', () => {
  test('single precinct configuration', () => {
    const precinct = election.precincts[0];
    const ballotStyle = election.ballotStyles[0];
    const activateCardlessVoterSessionMock = vi.fn();

    renderScreen({
      electionDefinition: electionGeneralDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      appPrecinct: singlePrecinctSelectionFor(precinct.id),
    });

    userEvent.click(screen.getButton(`Start Voting Session: ${precinct.name}`));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledWith(
      precinct.id,
      ballotStyle.id
    );
  });

  test('single precinct configuration with splits', () => {
    const precinct = election.precincts[1];
    assert(hasSplits(precinct));
    const [ballotStyle1, ballotStyle2] = election.ballotStyles;
    const activateCardlessVoterSessionMock = vi.fn();

    renderScreen({
      electionDefinition: electionGeneralDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      appPrecinct: singlePrecinctSelectionFor(precinct.id),
    });

    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(precinct.splits[0].name));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      ballotStyle2.id
    );

    activateCardlessVoterSessionMock.mockClear();

    userEvent.click(screen.getByText(precinct.splits[0].name));
    userEvent.click(screen.getByText(precinct.splits[1].name));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      ballotStyle1.id
    );
  });

  test('all precincts configuration', () => {
    const [precinct1, precinct2] = election.precincts;
    assert(hasSplits(precinct2));
    const [ballotStyle1, ballotStyle2] = election.ballotStyles;
    const activateCardlessVoterSessionMock = vi.fn();
    renderScreen({
      electionDefinition: electionGeneralDefinition,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      appPrecinct: ALL_PRECINCTS_SELECTION,
    });
    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(precinct1.name));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct1.id,
      ballotStyle1.id
    );

    activateCardlessVoterSessionMock.mockClear();

    userEvent.click(screen.getByText(precinct1.name));
    userEvent.click(screen.getByText(precinct2.splits[0].name));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct2.id,
      ballotStyle2.id
    );

    activateCardlessVoterSessionMock.mockClear();

    userEvent.click(screen.getByText(precinct2.splits[0].name));
    userEvent.click(screen.getByText(precinct2.splits[1].name));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct2.id,
      ballotStyle1.id
    );
  });
});

describe('start voter session with blank sheet: primary election', () => {
  const electionDefinitionPrimary =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const electionPrimary = electionDefinitionPrimary.election;

  test('single precinct configuration', () => {
    const precinct = electionPrimary.precincts[0];
    const activateCardlessVoterSessionMock = vi.fn();

    renderScreen({
      electionDefinition: electionDefinitionPrimary,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      appPrecinct: singlePrecinctSelectionFor(precinct.id),
    });

    screen.getByText('Select ballot style:');
    screen.getButton('Fish');
    userEvent.click(screen.getButton('Mammal'));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledWith(
      precinct.id,
      '1-Ma_en'
    );
  });

  test('single precinct configuration with splits', () => {
    const [, , , precinct] = electionPrimary.precincts;
    assert(hasSplits(precinct));

    const activateCardlessVoterSessionMock = vi.fn();

    renderScreen({
      electionDefinition: electionDefinitionPrimary,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      appPrecinct: singlePrecinctSelectionFor(precinct.id),
    });

    userEvent.click(screen.getByText("Select voter's precinct…"));
    userEvent.click(screen.getByText(precinct.splits[0].name));
    screen.getByText('Select ballot style:');
    screen.getButton('Fish');
    userEvent.click(screen.getButton('Mammal'));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      '3-Ma_en'
    );

    activateCardlessVoterSessionMock.mockClear();

    userEvent.click(screen.getByText(precinct.splits[0].name));
    userEvent.click(screen.getByText(precinct.splits[1].name));
    screen.getByText('Select ballot style:');
    userEvent.click(screen.getButton('Fish'));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct.id,
      '4-F_en'
    );
  });

  test('all precincts configuration', () => {
    const [precinct1, , , precinct4] = electionPrimary.precincts;
    assert(hasSplits(precinct4));

    const activateCardlessVoterSessionMock = vi.fn();

    renderScreen({
      electionDefinition: electionDefinitionPrimary,
      activateCardlessVoterSession: activateCardlessVoterSessionMock,
      appPrecinct: ALL_PRECINCTS_SELECTION,
    });

    userEvent.click(screen.getByText("Select voter's precinct…"));
    userEvent.click(screen.getByText(precinct1.name));
    userEvent.click(screen.getButton('Mammal'));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct1.id,
      '1-Ma_en'
    );

    activateCardlessVoterSessionMock.mockClear();

    userEvent.click(screen.getByText(precinct1.name));
    userEvent.click(screen.getByText(precinct4.splits[0].name));
    userEvent.click(screen.getButton('Mammal'));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct4.id,
      '3-Ma_en'
    );

    activateCardlessVoterSessionMock.mockClear();

    userEvent.click(screen.getByText(precinct4.splits[0].name));
    userEvent.click(screen.getByText(precinct4.splits[1].name));
    userEvent.click(screen.getButton('Fish'));
    expect(activateCardlessVoterSessionMock).toHaveBeenCalledOnce();
    expect(activateCardlessVoterSessionMock).toHaveBeenLastCalledWith(
      precinct4.id,
      '4-F_en'
    );
  });
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
