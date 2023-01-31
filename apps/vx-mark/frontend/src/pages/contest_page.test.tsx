import React from 'react';
import { screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';

import { render as renderWithBallotContext } from '../../test/test_utils';

import { ContestPage } from './contest_page';

const electionSample = electionSampleDefinition.election;
const firstContestTitle = electionSample.contests[0].title;

it('Renders ContestPage', () => {
  const { container } = renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
    }
  );
  screen.getByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

it('Renders ContestPage in Landscape orientation', () => {
  const { container } = renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

it('Renders ContestPage in Landscape orientation in Review Mode', () => {
  window.location.hash = '#review';
  renderWithBallotContext(
    <Route path="/contests/:contestNumber" component={ContestPage} />,
    {
      route: '/contests/0',
      precinctId: electionSample.precincts[0].id,
      ballotStyleId: electionSample.ballotStyles[0].id,
      machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
    }
  );
  screen.getByText(firstContestTitle);
  screen.getByText('Review');
});
