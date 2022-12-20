import { screen } from '@testing-library/react';
import React from 'react';
import { Route } from 'react-router-dom';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import {
  electionPrimarySampleDefinition,
  electionSampleNoSealDefinition,
  electionSampleWithSealDefinition,
} from '../data';
import { StartPage } from './start_page';

test('renders StartPage', () => {
  const electionDefinition = electionPrimarySampleDefinition;
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
  const electionDefinition = electionPrimarySampleDefinition;
  render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '12D',
    electionDefinition,
    precinctId: '23',
    route: '/',
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  expect(screen.getByText('22 contests').parentNode?.textContent).toBe(
    'Your ballot has 22 contests.'
  );
});

test('renders StartPage with inline SVG', () => {
  const electionDefinition = electionSampleWithSealDefinition;
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
