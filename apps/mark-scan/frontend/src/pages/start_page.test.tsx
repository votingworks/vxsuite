import { Route } from 'react-router-dom';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import { StartPage } from './start_page';
import { Paths } from '../config/globals';

test('renders StartPage', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });
  screen.getByRole('heading', { name: /Example Primary Election/ });
  screen.getByText('September 8, 2021');
  screen.getByText(hasTextAcrossElements('Your ballot has 7 contests.'));
});

test('renders StartPage in Landscape Orientation', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  screen.getByRole('heading', { name: /Example Primary Election/ });
  screen.getByText('September 8, 2021');
  screen.getByText(hasTextAcrossElements('Your ballot has 7 contests.'));
});

test('renders StartPage with inline SVG seal', () => {
  const electionDefinition = electionSampleDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders display settings button', () => {
  const electionDefinition = electionSampleDefinition;
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
