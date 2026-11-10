import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import {
  getContests,
  type CandidateContest,
  type CandidateOrderings,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { screen } from '../../test/react_testing_library.js';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config.js';

import { render as renderWithBallotContext } from '../../test/test_utils.js';

import { ContestScreen } from './contest_screen.js';
import {
  type ApiMock,
  createApiMock,
} from '../../test/helpers/mock_api_client.js';

const electionGeneral = readElectionGeneral();
const firstContestTitle = electionGeneral.contests[0]!.title;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Renders ContestScreen', async () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      apiMock,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );
  await screen.findByRole('heading', { name: firstContestTitle });
  screen.getButton(/next/i);
  screen.getButton(/back/i);
  screen.getButton(/view all/i);
  screen.getByRole('button', { name: 'Settings' });
});

test('Renders ContestScreen in Landscape orientation', async () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      apiMock,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
      machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  await screen.findByRole('heading', { name: firstContestTitle });
});

test('Renders ContestScreen in Landscape orientation in Review Mode', async () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      apiMock,
      route: '/contests/0#review',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
      machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  await screen.findByRole('heading', { name: firstContestTitle });
  screen.getButton(/review/i);
  expect(screen.queryButton(/back/i)).toBeNull();
  expect(screen.queryButton(/next/i)).toBeNull();
});

test('renders as voter screen', () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      apiMock,
      history,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});

describe('propagates candidate orderings', () => {
  const ballotStyle = electionGeneral.ballotStyles[0]!;

  const contests = getContests({
    ballotStyle,
    election: electionGeneral,
  }).filter((c): c is CandidateContest => c.type === 'candidate');

  const contest = assertDefined(contests[0]);

  function renderWithOrderings(orderings: CandidateOrderings | null) {
    renderWithBallotContext(
      <Route path="/contests/:contestNumber" component={ContestScreen} />,
      {
        apiMock,
        ballotStyleId: ballotStyle.id,
        candidateOrderings: orderings,
        contests: [contest],
        electionDefinition: {
          ballotHash: 'unused',
          election: electionGeneral,
        },
        precinctId: ballotStyle.precincts[0]!,
        route: `/contests/0`,
      }
    );
  }

  test('explicit', () => {
    const reversedCandidates = contest.candidates.toReversed();
    renderWithOrderings({ [contest.id]: reversedCandidates });

    const contestOptions = screen.getAllByRole('option');
    expect(contestOptions).toHaveLength(reversedCandidates.length);

    for (let i = 0; i < reversedCandidates.length; i += 1) {
      expect(contestOptions[i]).toHaveTextContent(reversedCandidates[i]!.name);
    }
  });

  test('null', () => {
    renderWithOrderings(null);

    const contestOptions = screen.getAllByRole('option');
    expect(contestOptions).toHaveLength(contest.candidates.length);

    for (let i = 0; i < contest.candidates.length; i += 1) {
      expect(contestOptions[i]).toHaveTextContent(contest.candidates[i]!.name);
    }
  });
});
