import { Route } from 'react-router-dom';
import {
  electionTwoPartyPrimaryDefinition,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { StartPage } from './start_page';
import { Paths } from '../config/globals';

test('renders StartPage', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });
  screen.getByRole('heading', {
    name: 'Mammal Party Example Primary Election',
  });
  screen.getByText('September 8, 2021');
  screen.getByText(
    hasTextAcrossElements('Precinct 1, Sample County, State of Sample')
  );
  screen.getByText(hasTextAcrossElements('Ballot style: 1M'));
  screen.getByText(
    hasTextAcrossElements('Number of contests on your ballot: 7')
  );
});

test('renders StartPage with inline SVG', () => {
  const electionDefinition = electionGeneralDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders display settings button', () => {
  const electionDefinition = electionGeneralDefinition;
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '12',
    electionDefinition,
    history,
    precinctId: '23',
    route: '/',
  });

  expect(history.location.pathname).toEqual('/');

  userEvent.click(screen.getButton(/color.+size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
