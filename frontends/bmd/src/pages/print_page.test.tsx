import { electionSample } from '@votingworks/fixtures';
import { getBallotStyle, getContests, vote } from '@votingworks/types';
import React from 'react';
import { Route } from 'react-router-dom';
import { mockOf } from '@votingworks/test-utils';
import { render } from '../../test/test_utils';
import { randomBase64 } from '../utils/random';
import { PrintPage } from './print_page';
import {
  electionSampleNoSealDefinition,
  electionSampleWithSealDefinition,
} from '../data';

// mock the random value so the snapshots match
jest.mock('../utils/random');
beforeEach(() => {
  mockOf(randomBase64).mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w');
});

it('renders PrintPage without votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders PrintPage with votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election: electionSample,
          ballotStyleId: '5',
        })!,
        election: electionSample,
      }),
      {
        president: 'barchi-hallaren',
        'question-a': ['no'],
        'question-b': ['yes'],
        'lieutenant-governor': 'norberg',
      }
    ),
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});

it('renders PrintPage without votes and inline seal', () => {
  const electionDefinition = electionSampleWithSealDefinition;
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});

it('renders PrintPage without votes and no seal', () => {
  const electionDefinition = electionSampleNoSealDefinition;
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});
