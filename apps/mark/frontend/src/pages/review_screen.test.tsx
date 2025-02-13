import { test } from 'vitest';
import { Route } from 'react-router-dom';
import { readElectionGeneral } from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { screen } from '../../test/react_testing_library';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ReviewScreen } from './review_screen';

const electionGeneral = readElectionGeneral();

test('Renders ReviewScreen', () => {
  renderWithBallotContext(<Route path="/review" component={ReviewScreen} />, {
    route: '/review',
    precinctId: electionGeneral.precincts[0].id,
    ballotStyleId: electionGeneral.ballotStyles[0].id,
  });
  screen.getByText('Review Your Votes');
  screen.getByText('Settings');
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
