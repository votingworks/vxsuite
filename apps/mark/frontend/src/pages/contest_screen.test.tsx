import { Route } from 'react-router-dom';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestScreen } from './contest_screen';

const electionGeneral = electionGeneralDefinition.election;
const firstContestTitle = electionGeneral.contests[0].title;

it('Renders ContestScreen', () => {
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

it('Renders ContestScreen in Landscape orientation', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByRole('heading', { name: firstContestTitle });
});

it('Renders ContestScreen in Landscape orientation in Review Mode', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0#review',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByRole('heading', { name: firstContestTitle });
  screen.getByText('Review');
});

it('renders as voter screen', () => {
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
