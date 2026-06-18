import { expect, test, vi } from 'vitest';
import {
  readElectionGeneral,
  readElectionWithMsEitherNeither,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { assert, find } from '@votingworks/basics';
import {
  CandidateContest,
  VotesDict,
  BallotMeasureContest,
} from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen, within } from '../../test/react_testing_library';

import { Contest } from './contest';
import {
  MsEitherNeitherContest,
  mergeMsEitherNeitherContests,
} from '../utils/ms_either_neither_contests';

const electionGeneral = readElectionGeneral();
const electionWithMsEitherNeither = readElectionWithMsEitherNeither();

const candidateContest = find(
  electionGeneral.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);
const measureContest = find(
  electionGeneral.contests,
  (c): c is BallotMeasureContest => c.type === 'measure'
);
const msEitherNeitherContest = find(
  mergeMsEitherNeitherContests(electionWithMsEitherNeither.contests),
  (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
);

test.each([
  ['with votes', candidateContest.candidates.slice(0, 1)],
  ['without votes', undefined],
])('candidate contest %s', (_, vote) => {
  render(
    <Contest
      ballotStyleId={electionGeneral.ballotStyles[0].id}
      election={electionGeneral}
      contest={candidateContest}
      votes={{
        [candidateContest.id]: vote,
      }}
      updateVote={vi.fn()}
    />
  );
  screen.getByText(candidateContest.title);
  // Tested further in candidate_contest.test.tsx
});

test('write-in character limit across contests', () => {
  const singleSeatCandidateContests = electionGeneral.contests.filter(
    (c) => c.type === 'candidate' && c.seats === 1
  ) as CandidateContest[];
  const manySeatCandidateContests = electionGeneral.contests.filter(
    (c) => c.type === 'candidate' && c.seats >= 3
  ) as CandidateContest[];
  const measureContests = electionGeneral.contests.filter(
    (c) => c.type === 'measure'
  );

  assert(singleSeatCandidateContests.length >= 2);
  assert(manySeatCandidateContests.length >= 2);
  assert(measureContests.length >= 1);

  let i = 0;
  function createWriteIn(name: string, index: number) {
    i += 1;
    return {
      id: `write-in-${i}`,
      isWriteIn: true,
      name,
      writeInIndex: index,
    };
  }

  const votes: VotesDict = {
    [singleSeatCandidateContests[0].id]: [
      createWriteIn('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 0),
    ],
    [singleSeatCandidateContests[1].id]: [
      singleSeatCandidateContests[1].candidates[0],
    ],
    [manySeatCandidateContests[0].id]: [
      manySeatCandidateContests[0].candidates[0],
      createWriteIn('ABCDEF 123456', 0),
      createWriteIn('ABC', 1),
    ],
    [manySeatCandidateContests[1].id]: [createWriteIn('A', 0)],
    [measureContests[0].id]: [measureContests[0].options[0].id],
  };

  render(
    <Contest
      ballotStyleId={electionGeneral.ballotStyles[0].id}
      election={electionGeneral}
      contest={manySeatCandidateContests[1]}
      votes={votes}
      updateVote={vi.fn()}
      numWriteInCharactersAllowedAcrossContests={60}
    />
  );

  screen.getByText(manySeatCandidateContests[1].title);
  userEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  const modal = within(screen.getByRole('alertdialog'));
  modal.getByText(hasTextAcrossElements(/characters remaining: 17/i)); // 60 - 43 = 17
  modal.getByText(
    hasTextAcrossElements(/write-in character limit across contests: 60/i)
  );
  // Tested further in candidate_contest.test.tsx
});

test('ballot measure contest', () => {
  render(
    <Contest
      ballotStyleId={electionGeneral.ballotStyles[0].id}
      election={electionGeneral}
      contest={measureContest}
      votes={{
        [measureContest.id]: [measureContest.options[0].id],
      }}
      updateVote={vi.fn()}
    />
  );
  screen.getByRole('heading', { name: measureContest.title });
  // Tested further in yes_no_contest.test.tsx
});

test('renders ms-either-neither contests', () => {
  const updateVote = vi.fn();
  render(
    <Contest
      ballotStyleId={electionWithMsEitherNeither.ballotStyles[0].id}
      election={electionWithMsEitherNeither}
      contest={msEitherNeitherContest}
      votes={{}}
      updateVote={updateVote}
    />
  );

  screen.getByText('Ballot Measure 1');
  userEvent.click(
    screen.getByRole('option', { name: /for approval of either/i })
  );
  expect(updateVote).toHaveBeenCalledWith('750000015', [
    msEitherNeitherContest.eitherOption.id,
  ]);
  userEvent.click(screen.getByRole('option', { name: /for alternative/i }));
  expect(updateVote).toHaveBeenCalledWith('750000016', [
    msEitherNeitherContest.secondOption.id,
  ]);
  // Tested further in ms_either_neither_contest.test.tsx
});
