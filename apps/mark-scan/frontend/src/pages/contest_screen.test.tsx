import { Route } from 'react-router-dom';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Paths } from '@votingworks/mark-flow-ui';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestScreen } from './contest_screen';

const electionGeneral = electionGeneralDefinition.election;
const firstContestTitle = electionGeneral.contests[0].title;

it('Renders ContestScreen', async () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
    }
  );
  await screen.findByRole('heading', { name: firstContestTitle });
  screen.getButton(/next/i);
  screen.getButton(/back/i);
  screen.getByRole('button', { name: 'Display Settings' });
});

it('Renders ContestScreen in Landscape orientation', async () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  await screen.findByRole('heading', { name: firstContestTitle });
});

it('Renders ContestScreen in Landscape orientation in Review Mode', async () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestScreen} />,
    {
      route: '/contests/0#review',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  await screen.findByRole('heading', { name: firstContestTitle });
  screen.getByText('Review');
});

it('renders display settings button', async () => {
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

  expect(history.location.pathname).toEqual('/contests/0');

  userEvent.click(await screen.findButton(/display settings/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
