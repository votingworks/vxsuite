import { asElectionDefinition, electionSample } from '@votingworks/fixtures';
import {
  getBallotStyle,
  getContests,
  parseElection,
  PrecinctIdSchema,
  unsafeParse,
  vote,
} from '@votingworks/types';
import React from 'react';
import { Route } from 'react-router-dom';
import { mockOf } from '@votingworks/test-utils';
import { render } from '../../test/test_utils';
import electionSampleNoSeal from '../data/electionSampleNoSeal.json';
import electionSampleWithSeal from '../data/electionSampleWithSeal.json';
import { randomBase64 } from '../utils/random';
import { PrintPage } from './print_page';

// mock the random value so the snapshots match
jest.mock('../utils/random');
beforeEach(() => {
  mockOf(randomBase64).mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w');
});

it('renders PrintPage without votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: unsafeParse(PrecinctIdSchema, '21'),
    route: '/print',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders PrintPage with votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: unsafeParse(PrecinctIdSchema, '21'),
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
  const electionDefinition = asElectionDefinition(
    parseElection(electionSampleWithSeal)
  );
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: unsafeParse(PrecinctIdSchema, '21'),
    route: '/print',
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});

it('renders PrintPage without votes and no seal', () => {
  const electionDefinition = asElectionDefinition(
    parseElection(electionSampleNoSeal)
  );
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: unsafeParse(PrecinctIdSchema, '21'),
    route: '/print',
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});
