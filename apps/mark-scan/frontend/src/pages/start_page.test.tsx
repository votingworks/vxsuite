import React from 'react';
import { Route } from 'react-router-dom';
import {
  primaryElectionSampleDefinition,
  electionSampleNoSealDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import { StartPage } from './start_page';
import { Paths } from '../config/globals';

test('renders StartPage', () => {
  const electionDefinition = primaryElectionSampleDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '12D',
    electionDefinition,
    precinctId: '23',
    route: '/',
  });
  expect(screen.queryByText('Democratic Primary Election')).toBeInTheDocument();
  screen.getByText(/(12D)/);
  expect(container.firstChild).toMatchSnapshot();
});

test('renders StartPage in Landscape Orientation', () => {
  const electionDefinition = primaryElectionSampleDefinition;
  render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '12D',
    electionDefinition,
    precinctId: '23',
    route: '/',
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  expect(screen.getByText('21 contests').parentNode?.textContent).toEqual(
    'Your ballot has 21 contests.'
  );
});

test('renders StartPage with inline SVG', () => {
  const electionDefinition = electionSampleDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});

test('renders StartPage with no seal', () => {
  const electionDefinition = electionSampleNoSealDefinition;
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
