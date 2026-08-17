import { expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { Candidate, CandidateContest } from '@votingworks/types';
import { find } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library.js';
import { CandidateInfoCaption } from './candidate_info_caption.js';

const election = readElectionGeneral();
const contest = find(
  election.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);
const [candidate] = contest.candidates as [Candidate];

test('renders the designation when the candidate has one', () => {
  render(
    <CandidateInfoCaption
      candidate={{ ...candidate, designation: 'Member of City Council' }}
      election={election}
      matchesSelectedStraightParty={false}
    />
  );

  screen.getByText('Member of City Council');
});

test('renders nothing for the designation when the candidate has none', () => {
  render(
    <CandidateInfoCaption
      candidate={candidate}
      election={election}
      matchesSelectedStraightParty={false}
    />
  );

  expect(screen.queryByText('Member of City Council')).toBeNull();
});
