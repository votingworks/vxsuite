import { screen } from '@testing-library/react';
import React from 'react';
import { Route } from 'react-router-dom';
import {
  primaryElectionSampleDefinition,
  electionSampleNoSealDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import { StartPage } from './start_page';

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
  expect(screen.getByText('22 contests').parentNode?.textContent).toEqual(
    'Your ballot has 22 contests.'
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
