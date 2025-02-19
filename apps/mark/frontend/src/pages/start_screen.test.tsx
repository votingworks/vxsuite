import { expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import {
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { BallotStyleId } from '@votingworks/types';
import { screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { StartScreen } from './start_screen';

test('renders StartScreen', () => {
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: '1M' as BallotStyleId,
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });
  const heading = screen.getByRole('heading', {
    name: 'Mammal Party Example Primary Election',
  });
  screen.getByText('September 8, 2021');
  screen.getByText(
    hasTextAcrossElements('Precinct 1, Sample County, State of Sample')
  );
  screen.getByText(hasTextAcrossElements('Ballot Style: 1M'));
  screen.getByText(
    hasTextAcrossElements('Number of contests on your ballot: 7')
  );
  expect(
    heading.parentElement!.parentElement!.getElementsByTagName('img')
  ).toHaveLength(1); // Seal
});

test('renders as voter screen', () => {
  const electionDefinition = readElectionGeneralDefinition();
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
