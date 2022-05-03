import { screen } from '@testing-library/react';
import React from 'react';
import { Route } from 'react-router-dom';
import { render } from '../../test/test_utils';
import {
  electionPrimarySampleDefinition,
  electionSampleNoSealDefinition,
  electionSampleWithSealDefinition,
} from '../data';
import { StartPage } from './start_page';

it('renders StartPage', () => {
  const electionDefinition = electionPrimarySampleDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    ballotStyleId: '12D',
    electionDefinition,
    precinctId: '23',
    route: '/',
  });
  expect(
    screen.getAllByText('Democratic Primary Election').length
  ).toBeGreaterThan(1);
  screen.getByText(/ballot style 12D/);
  expect(container.firstChild).toMatchSnapshot();
});

it('renders StartPage with inline SVG', () => {
  const electionDefinition = electionSampleWithSealDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders StartPage with no seal', () => {
  const electionDefinition = electionSampleNoSealDefinition;
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});
