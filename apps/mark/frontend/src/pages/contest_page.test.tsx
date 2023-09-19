import { Route } from 'react-router-dom';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestPage } from './contest_page';
import { Paths } from '../config/globals';

const electionGeneral = electionGeneralDefinition.election;
const firstContestTitle = electionGeneral.contests[0].title;

it('Renders ContestPage', () => {
  const { container } = renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
    }
  );
  screen.getByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

it('Renders ContestPage in Landscape orientation', () => {
  const { container } = renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

it('Renders ContestPage in Landscape orientation in Review Mode', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0#review',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByText(firstContestTitle);
  screen.getByText('Review');
});

it('renders display settings button', () => {
  const history = createMemoryHistory({ initialEntries: ['/contests/0'] });

  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      history,
      route: '/contests/0',
      precinctId: electionGeneral.precincts[0].id,
      ballotStyleId: electionGeneral.ballotStyles[0].id,
    }
  );

  expect(history.location.pathname).toEqual('/contests/0');

  userEvent.click(screen.getButton(/color.+size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
