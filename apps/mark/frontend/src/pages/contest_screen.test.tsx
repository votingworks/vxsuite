import { test } from 'vitest';
import { Route } from 'react-router-dom';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
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
  screen.getByRole('button', { name: 'Settings' });
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
  screen.getByText('Review');
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
