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

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  const original =
    jest.requireActual<typeof import('@votingworks/utils')>(
      '@votingworks/utils'
    );
  // Mock random string generation so that snapshots match, while leaving the rest of the module
  // intact
  return {
    ...original,
    randomBallotId: () => 'CHhgYxfN5GeqnK8KaVOt1w',
  };
});

it('prints correct ballot without votes', async () => {
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot with votes', async () => {
  render(<Route path="/print" component={PrintPage} />, {
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
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot without votes and inline seal', async () => {
  const electionDefinition = electionSampleDefinition;
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
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
    precinctId: '21',
    route: '/print',
  });
  await expectPrintToMatchSnapshot();
});
