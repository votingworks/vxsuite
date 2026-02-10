import { expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestScreen } from './contest_screen';

const electionGeneral = readElectionGeneral();
const firstContestTitle = electionGeneral.contests[0].title;

test('Renders ContestScreen', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
    }
  );
  screen.getByRole('heading', { name: firstContestTitle });
  screen.getButton(/next/i);
  screen.getButton(/back/i);
  screen.getButton(/view all/i);
  screen.getByRole('button', { name: 'Settings' });
});

test('View All button navigates to review page', () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      history,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
    }
  );

  userEvent.click(screen.getButton(/view all/i));
  expect(history.location.pathname).toEqual('/review');
  expect(history.location.search).toEqual('?fromContest=0');
});

test('Renders ContestScreen in Landscape orientation', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
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
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
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
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
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
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
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
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
    }
  );

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});
