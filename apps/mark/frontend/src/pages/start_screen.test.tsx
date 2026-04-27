import { expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import {
  electionOpenPrimaryFixtures,
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import { BallotStyleId } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
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
  screen.getByText('Mammal Party');
  const heading = screen.getByRole('heading', {
    name: 'Example Primary Election',
  });
  screen.getByText('September 8, 2021');
  screen.getByText(hasTextAcrossElements('Sample County, State of Sample'));
  screen.getByText('Precinct 1');
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

test('Start navigates to first contest for non-open-primary elections', () => {
  const electionDefinition = readElectionGeneralDefinition();
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: '12' as BallotStyleId,
    electionDefinition,
    history,
    precinctId: '23',
    route: '/',
  });

  userEvent.click(screen.getButton(/start voting/i));
  expect(history.location.pathname).toEqual('/contests/0');
});

test('Start navigates to party selection for open primary elections', () => {
  const electionDefinition =
    electionOpenPrimaryFixtures.readElectionDefinition();
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(<Route path="/" component={StartScreen} />, {
    ballotStyleId: 'ballot-style-1' as BallotStyleId,
    electionDefinition,
    history,
    precinctId: 'precinct-1',
    route: '/',
  });

  userEvent.click(screen.getButton(/start voting/i));
  expect(history.location.pathname).toEqual('/party-selection');
});
