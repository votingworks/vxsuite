import React from 'react';
import {
  Candidate,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/types';
import {
  electionSampleDefinition,
  electionSampleNoSealDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { fireEvent, render, screen } from '@testing-library/react';

import { BmdPaperBallot } from './bmd_paper_ballot';

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

function renderBmdPaperBallot({
  electionDefinition,
  ballotStyleId,
  precinctId,
  votes,
  isLiveMode = false,
  onRendered,
}: {
  electionDefinition: ElectionDefinition;
  ballotStyleId: string;
  precinctId: string;
  votes: { [key: string]: string | string[] | Candidate };
  isLiveMode?: boolean;
  onRendered?: () => void;
}) {
  return render(
    <BmdPaperBallot
      ballotStyleId={ballotStyleId}
      electionDefinition={electionDefinition}
      isLiveMode={isLiveMode}
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
      onRendered={onRendered}
    />
  );
}

test('BmdPaperBallot renders votes for candidate contests and yes-no contests', () => {
  const { container } = renderBmdPaperBallot({
    electionDefinition: electionSampleDefinition,
    ballotStyleId: '5',
    precinctId: '21',
    votes: {
      president: 'barchi-hallaren',
      'lieutenant-governor': 'norberg',
      'question-a': ['yes'],
      'question-b': ['no'],
    },
  });

  screen.getByText('Joseph Barchi and Joseph Hallaren');
  screen.getByText('Chris Norberg');
  screen.getByText('Yes on Question A');
  screen.getByText('No on Question B');

  // Use a snapshot to avoid unintentional regressions to general layout
  expect(container).toMatchSnapshot();
});

test('BmdPaperBallot renders votes for MS either-neither contests', () => {
  const { container } = renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '750000015': ['yes'],
      '750000016': ['yes'],
    },
  });

  screen.getByText(
    '• FOR APPROVAL OF EITHER Initiative No. 65 OR Alternative Measure No. 65 A'
  );
  screen.getByText('• FOR Initiative Measure No. 65');

  // Use a snapshot to avoid unintentional regressions to general layout
  expect(container).toMatchSnapshot();
});

test('BmdPaperBallot renders votes for MS either-neither contests (only either-neither vote provided)', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '750000015': ['no'],
    },
  });

  screen.getByText(
    '• AGAINST BOTH Initiative Measure No. 65 AND Alternative Measure No. 65 A'
  );
  screen.getByText('• [no selection]');
});

test('BmdPaperBallot renders votes for MS either-neither contests (only pick-one vote provided)', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '750000016': ['no'],
    },
  });

  screen.getByText('• [no selection]');
  screen.getByText('• FOR Alternative Measure 65 A');
});

test('BmdPaperBallot renders when no votes', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {},
  });

  expect(screen.getAllByText('[no selection]')).toHaveLength(8);
});

test('BmdPaperBallot renders when not in live mode', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {},
    isLiveMode: false,
  });

  screen.getByText('Unofficial TEST Ballot');
  expect(screen.queryByText('Official Ballot')).not.toBeInTheDocument();
});

test('BmdPaperBallot renders when in live mode', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {},
    isLiveMode: true,
  });

  screen.getByText('Official Ballot');
  expect(screen.queryByText('Unofficial TEST Ballot')).not.toBeInTheDocument();
});

test('BmdPaperBallot renders votes for write-in candidates', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {
      '775020876': {
        id: 'write-in-0',
        isWriteIn: true,
        name: 'HOT DOG',
      },
    },
  });

  screen.getByText('HOT DOG');
  screen.getByText('(write-in)');
});

test('BmdPaperBallot renders remaining choices for multi-seat contests', () => {
  renderBmdPaperBallot({
    electionDefinition: electionSampleDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    votes: {
      'city-council': ['eagle', 'smith'],
    },
  });

  screen.getByText('[no selection for 1 of 3 choices]');
});

test('BmdPaperBallot renders seal when provided', () => {
  renderBmdPaperBallot({
    electionDefinition: electionWithMsEitherNeitherDefinition,
    ballotStyleId: '1',
    precinctId: '6525',
    votes: {},
  });

  screen.getByTestId('printed-ballot-seal');
});

test('BmdPaperBallot renders no seal when not provided', () => {
  renderBmdPaperBallot({
    electionDefinition: electionSampleNoSealDefinition,
    ballotStyleId: '5',
    precinctId: '21',
    votes: {},
  });

  expect(screen.queryByTestId('printed-ballot-seal')).not.toBeInTheDocument();
});

describe('BmdPaperBallot calls onRendered', () => {
  test('when "seal" present', () => {
    const onRendered = jest.fn();
    renderBmdPaperBallot({
      electionDefinition: electionSampleDefinition,
      ballotStyleId: '5',
      precinctId: '21',
      votes: {},
      onRendered,
    });

    expect(onRendered).toHaveBeenCalledTimes(1);
  });

  test('when no seal available', () => {
    const onRendered = jest.fn();
    renderBmdPaperBallot({
      electionDefinition: electionSampleNoSealDefinition,
      ballotStyleId: '5',
      precinctId: '21',
      votes: {},
      onRendered,
    });

    expect(onRendered).toHaveBeenCalledTimes(1);
  });

  test('when "sealUrl" present', () => {
    const onRendered = jest.fn();
    renderBmdPaperBallot({
      electionDefinition: electionWithMsEitherNeitherDefinition,
      ballotStyleId: '1',
      precinctId: '6525',
      votes: {},
      onRendered,
    });

    expect(onRendered).not.toHaveBeenCalled();
    fireEvent.load(screen.getByTestId('printed-ballot-seal-image'));
    expect(onRendered).toHaveBeenCalledTimes(1);
  });
});
