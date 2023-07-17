import { Route } from 'react-router-dom';
import { electionSampleDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestPage } from './contest_page';
import { Paths } from '../config/globals';

const electionSample = electionSampleDefinition.election;
const firstContestTitle = electionSample.contests[0].title;

it('Renders ContestPage', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
    }
  );
  screen.getByText(firstContestTitle);
});

it('Renders ContestPage in Landscape orientation', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByText(firstContestTitle);
});

it('Renders ContestPage in Landscape orientation in Review Mode', () => {
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0#review',
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
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
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
    }
  );

  expect(history.location.pathname).toEqual('/contests/0');

  userEvent.click(screen.getButton(/color.+size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
