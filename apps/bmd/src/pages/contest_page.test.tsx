import { screen } from '@testing-library/react';
import React from 'react';
import { Route } from 'react-router-dom';

import { render } from '../../test/test_utils';

import electionSample from '../data/electionSample.json';

import { ContestPage } from './contest_page';

const firstContestTitle = electionSample.contests[0].title;

it('Renders ContestPage', () => {
  const { container } = render(
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
