import { expect, test, vi } from 'vitest';
import {
  readElectionGeneral,
  readElectionWithMsEitherNeither,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { find } from '@votingworks/basics';
import { CandidateContest, YesNoContest } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';

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
const yesnoContest = find(
  electionGeneral.contests,
  (c): c is YesNoContest => c.type === 'yesno'
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

test('yesno contest', () => {
  render(
    <Contest
      election={electionGeneral}
      contest={yesnoContest}
      votes={{
        [yesnoContest.id]: [yesnoContest.yesOption.id],
      }}
      updateVote={vi.fn()}
    />
  );
  screen.getByRole('heading', { name: yesnoContest.title });
  // Tested further in yes_no_contest.test.tsx
});

test('renders ms-either-neither contests', () => {
  const updateVote = vi.fn();
  render(
    <Contest
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

test('renders breadcrumbs', () => {
  render(
    <Contest
      breadcrumbs={{ ballotContestCount: 15, contestNumber: 3 }}
      contest={yesnoContest}
      election={electionGeneral}
      updateVote={vi.fn()}
      votes={{}}
    />
  );

  screen.getByText(hasTextAcrossElements(/contest number: 3/i));
  screen.getByText(hasTextAcrossElements(/total contests: 15/i));
});
