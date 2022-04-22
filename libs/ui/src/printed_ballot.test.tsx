import React from 'react';
import {
  electionSampleDefinition,
  electionSampleNoSealDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import {
  Candidate,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/types';
import { randomBase64 } from '@votingworks/utils';
import { render } from '@testing-library/react';

import { PrintedBallot } from './printed_ballot';

jest.mock('@votingworks/utils', (): { randomBase64: typeof randomBase64 } => {
  const original = jest.requireActual<Record<string, unknown>>(
    '@votingworks/utils'
  );
  // Mock random string generation so that snapshots match, while leaving the rest of the module
  // intact
  return {
    ...original,
    randomBase64: () => 'CHhgYxfN5GeqnK8KaVOt1w',
  };
});

interface TestCase {
  description: string;
  electionDefinition: ElectionDefinition;
  ballotStyleId: string;
  precinctId: string;
  votes: {
    [key: string]: string | string[] | Candidate;
  };
  isLiveMode?: boolean;
}

const testCases: TestCase[] = [
  {
    description:
      'PrintedBallot renders votes for candidate contests and yes-no contests',
    electionDefinition: electionSampleDefinition,
    ballotStyleId: '5',
    precinctId: '21',
    votes: {
      president: 'barchi-hallaren',
      'lieutenant-governor': 'norberg',
      'question-a': ['yes'],
      'question-b': ['no'],
    },
  },
  {
    description:
      'PrintedBallot renders votes for MS either-neither contests (both either-neither and pick-one vote provided)',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '750000015': ['yes'],
      '750000016': ['yes'],
    },
  },
  {
    description:
      'PrintedBallot renders votes for MS either-neither contests (only either-neither vote provided)',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '750000015': ['no'],
    },
  },
  {
    description:
      'PrintedBallot renders votes for MS either-neither contests (only pick-one vote provided)',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '750000016': ['no'],
    },
  },
  {
    description: 'PrintedBallot renders when no votes',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {},
  },
  {
    description: 'PrintedBallot renders when no votes and in live mode',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {},
    isLiveMode: true,
  },
  {
    description: 'PrintedBallot renders votes for write-in candidates',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '775020876': {
        id: 'write-in__HOT DOG',
        isWriteIn: true,
        name: 'HOT DOG',
      },
    },
  },
  {
    description:
      'PrintedBallot renders remaining choices for multi-seat contests',
    electionDefinition: electionSampleDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    votes: {
      'city-council': ['eagle', 'smith'],
    },
  },
  {
    description: 'PrintedBallot renders when no seal',
    electionDefinition: electionSampleNoSealDefinition,
    ballotStyleId: '5',
    precinctId: '21',
    votes: {},
  },
];

for (const {
  description,
  electionDefinition,
  ballotStyleId,
  precinctId,
  votes,
  isLiveMode,
} of testCases) {
  test(description, () => {
    const { container } = render(
      <PrintedBallot
        ballotStyleId={ballotStyleId}
        electionDefinition={electionDefinition}
        isLiveMode={Boolean(isLiveMode)}
        precinctId={precinctId}
        votes={vote(
          getContests({
            ballotStyle: getBallotStyle({
              ballotStyleId,
              election: electionDefinition.election,
            })!,
            election: electionDefinition.election,
          }),
          votes
        )}
      />
    );
    expect(container).toMatchSnapshot();
  });
}
