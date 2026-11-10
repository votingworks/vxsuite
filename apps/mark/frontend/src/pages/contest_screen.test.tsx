import { describe, expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import {
  electionCombinedBallotPrimaryFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { userEvent } from '@testing-library/user-event';
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

const electionGeneral = readElectionGeneral();
const firstContestTitle = electionGeneral.contests[0]!.title;

test('Renders ContestScreen', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );
  screen.getByRole('heading', { name: firstContestTitle });
  screen.getButton(/next/i);
  screen.getButton(/back/i);
  screen.getButton(/view all/i);
  screen.getByRole('button', { name: 'Settings' });
});

test('View All button navigates to review page', async () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      history,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );

  await userEvent.click(screen.getButton(/view all/i));
  expect(history.location.pathname).toEqual('/review');
  expect(history.location.search).toEqual('?fromContest=0');
});

test('Renders ContestScreen in Landscape orientation', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
      machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByRole('heading', { name: firstContestTitle });
});

test('Renders ContestScreen in Landscape orientation in Review Mode', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0#review',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
      machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByRole('heading', { name: firstContestTitle });
  screen.getButton(/review/i);
  expect(screen.queryButton(/back/i)).toBeNull();
  expect(screen.queryButton(/next/i)).toBeNull();
});

test('does not show View All on the last contest', () => {
  const lastContestIndex = electionGeneral.contests.length - 1;

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: `/contests/${lastContestIndex}`,
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );
  screen.getButton(/back/i);
  screen.getButton(/next/i);
  expect(screen.queryButton(/view all/i)).toBeNull();
});

test('review mode shows only Review button', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0#review',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );
  screen.getButton(/review/i);
  expect(screen.queryButton(/back/i)).toBeNull();
  expect(screen.queryButton(/next/i)).toBeNull();
});

test('renders as voter screen', () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      history,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});

test('Back from first contest goes to start screen when no party selected', async () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      history,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0]!.id,
      ballotStyleId: electionGeneral.ballotStyles[0]!.id,
    }
  );

  await userEvent.click(screen.getButton(/back/i));
  expect(history.location.pathname).toEqual('/');
});

test('Back from first contest goes to party selection when a party is selected', async () => {
  const electionDefinition =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      electionDefinition,
      contests: electionDefinition.election.contests,
      history,
      route: '/contests/0',
      precinctId: 'precinct-1',
      ballotStyleId: 'ballot-style-1',
      selectedPartyId: 'democratic-party',
    }
  );

  await userEvent.click(screen.getButton(/back/i));
  expect(history.location.pathname).toEqual('/party-selection');
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
