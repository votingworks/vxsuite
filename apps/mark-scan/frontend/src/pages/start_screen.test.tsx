import { Route } from 'react-router-dom';
import {
  electionGeneralDefinition,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import { StartScreen } from './start_screen';

test('renders StartScreen', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: '1M',
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
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
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
    ballotStyleId: '12',
    electionDefinition,
    history,
    precinctId: '23',
    route: '/',
  });

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});
