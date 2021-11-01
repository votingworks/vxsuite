import React from 'react';
import { Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { asElectionDefinition } from '@votingworks/fixtures';
import { parseElection } from '@votingworks/types';

import { render } from '../../test/testUtils';
import electionSampleWithSeal from '../data/electionSampleWithSeal.json';
import electionSampleNoSeal from '../data/electionSampleNoSeal.json';
import electionPrimarySample from '../data/electionPrimarySample.json';

import { StartPage } from './StartPage';

it('renders StartPage', async () => {
  const electionDefinition = asElectionDefinition(
    parseElection(electionPrimarySample)
  );
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

it('renders StartPage with inline SVG', async () => {
  const electionDefinition = asElectionDefinition(
    parseElection(electionSampleWithSeal)
  );
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders StartPage with no seal', async () => {
  const electionDefinition = asElectionDefinition(
    parseElection(electionSampleNoSeal)
  );
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(container.firstChild).toMatchSnapshot();
});
