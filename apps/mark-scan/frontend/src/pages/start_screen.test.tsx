import { Route } from 'react-router-dom';
import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { BallotStyleId } from '@votingworks/types';
import { screen } from '../../test/react_testing_library';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { render } from '../../test/test_utils';
import { StartScreen } from './start_screen';

test('renders StartScreen', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: '1M' as BallotStyleId,
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });
  screen.getByRole('heading', { name: /Example Primary Election/ });
  screen.getByText('September 8, 2021');
  screen.getByText(
    hasTextAcrossElements('Number of contests on your ballot: 7')
  );
});

test('renders StartScreen in Landscape Orientation', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: '1M' as BallotStyleId,
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
    machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
  });
  const heading = screen.getByRole('heading', {
    name: /Example Primary Election/,
  });
  screen.getByText('September 8, 2021');
  screen.getByText(
    hasTextAcrossElements('Number of contests on your ballot: 7')
  );
  expect(
    heading.parentElement!.parentElement!.getElementsByTagName('img')
  ).toHaveLength(1); // Seal
});

it('renders as voter screen', () => {
  const electionDefinition = electionGeneralDefinition;
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: '12' as BallotStyleId,
    electionDefinition,
    history,
    precinctId: '23',
    route: '/',
  });

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});
