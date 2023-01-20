import { electionSample } from '@votingworks/fixtures';
import { getBallotStyle, getContests, vote } from '@votingworks/types';
import React from 'react';
import { Route } from 'react-router-dom';
import { expectPrintToMatchSnapshot } from '@votingworks/test-utils';
import { render } from '../../test/test_utils';
import { PrintPage } from './print_page';
import {
  electionSampleNoSealDefinition,
  electionSampleWithSealDefinition,
} from '../data';

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
    markVoterCardPrinted: jest.fn().mockResolvedValue(true),
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
    markVoterCardPrinted: jest.fn().mockResolvedValue(true),
  });
  await expectPrintToMatchSnapshot();
});

it('prints correct ballot without votes and inline seal', async () => {
  const electionDefinition = electionSampleWithSealDefinition;
  render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
    markVoterCardPrinted: jest.fn().mockResolvedValue(true),
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
    markVoterCardPrinted: jest.fn().mockResolvedValue(true),
  });
  await expectPrintToMatchSnapshot();
});
