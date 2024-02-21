import { Route } from 'react-router-dom';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { Paths } from '@votingworks/mark-flow-ui';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ReviewScreen } from './review_screen';

const electionGeneral = electionGeneralDefinition.election;

it('Renders ReviewScreen', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
  });
  screen.getByText('Review Your Votes');
  screen.getByText('Settings');
});

it('Renders ReviewScreen in Landscape orientation', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  screen.getByText('Review Your Votes');
});

it('renders display settings button', () => {
  const history = createMemoryHistory({ initialEntries: ['/review'] });

  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    ballotStyleId: electionGeneral.ballotStyles[0].id,
    history,
    precinctId: electionGeneral.precincts[0].id,
    route: '/review',
  });

  expect(history.location.pathname).toEqual('/review');

  userEvent.click(screen.getButton('Settings'));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
