import {
  electionSample,
  electionSampleNoSealDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { getBallotStyle, getContests, vote } from '@votingworks/types';
import React from 'react';
import { Route } from 'react-router-dom';
import { expectPrintToMatchSnapshot } from '@votingworks/test-utils';
import { render } from '../../test/test_utils';
import { PrintPage } from './print_page';

jest.mock(
  '@votingworks/ballot-encoder',
  (): typeof import('@votingworks/ballot-encoder') => {
    return {
      ...jest.requireActual('@votingworks/ballot-encoder'),
      // mock encoded ballot so BMD ballot QR code does not change with every change to election definition
      encodeBallot: () => new Uint8Array(),
    };
  }
);

it('prints correct ballot without votes', async () => {
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot with votes', async () => {
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
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
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot without votes and inline seal', async () => {
  const electionDefinition = electionSampleDefinition;
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot without votes and no seal', async () => {
  const electionDefinition = electionSampleNoSealDefinition;
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    generateBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});
