import { expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ReviewScreen } from './review_screen';

const electionGeneral = readElectionGeneral();

test('Renders ReviewScreen with Print My Ballot in final review mode', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
  });
  screen.getByText('Review Your Votes');
  screen.getByText('Settings');
  screen.getButton(/print my ballot/i);
  expect(screen.queryButton(/back/i)).toBeNull();
});

test('Renders ReviewScreen in Landscape orientation', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
    machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
  });
  screen.getByText('Review Your Votes');
});

test('View All mode shows both back button and print button', () => {
  const history = createMemoryHistory({
    initialEntries: ['/review?fromContest=3'],
  });

  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    history,
    route: '/review?fromContest=3',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
  });

  screen.getByText('Review Your Votes');
  screen.getButton(/print my ballot/i);
  userEvent.click(screen.getButton(/back/i));
  expect(history.location.pathname).toEqual('/contests/3');
});

test('View All mode navigates to contest without review hash', () => {
  const history = createMemoryHistory({
    initialEntries: ['/review?fromContest=3'],
  });

  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    history,
    route: '/review?fromContest=3',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
  });

  const firstContestTitle = electionGeneral.contests[0].title;
  userEvent.click(screen.getByText(firstContestTitle));
  expect(history.location.pathname).toEqual('/contests/0');
  expect(history.location.hash).toEqual('');
});

test('final review mode navigates to contest with review hash', () => {
  const history = createMemoryHistory({
    initialEntries: ['/review'],
  });

  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    history,
    route: '/review',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
  });

  const firstContestTitle = electionGeneral.contests[0].title;
  userEvent.click(screen.getByText(firstContestTitle));
  expect(history.location.pathname).toEqual('/contests/0');
  expect(history.location.hash).toEqual('#review');
});

test('renders as voter screen', () => {
  const history = createMemoryHistory({ initialEntries: ['/review'] });

  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    ballotStyleId: electionGeneral.ballotStyles[0].id,
    history,
    precinctId: electionGeneral.precincts[0].id,
    route: '/review',
  });

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});
