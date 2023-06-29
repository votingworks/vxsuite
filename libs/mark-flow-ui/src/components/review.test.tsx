import {
  electionSampleDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { CandidateContest, YesOrNo } from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { screen, within, render } from '../../test/react_testing_library';
import { mergeMsEitherNeitherContests } from '../utils/ms_either_neither_contests';
import { Review } from './review';

const electionSample = electionSampleDefinition.election;

test('renders', () => {
  const contests = mergeMsEitherNeitherContests(electionSample.contests);
  render(
    <Review
      election={electionSample}
      contests={contests}
      precinctId={electionSample.precincts[0].id}
      votes={{}}
      returnToContest={jest.fn()}
    />
  );
  expect(
    screen.getAllByText('You may still vote in this contest.')
  ).toHaveLength(contests.length);
});

test('candidate contest with no votes', () => {
  const contest = electionSample.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);
  const contests = [contest];
  render(
    <Review
      election={electionSample}
      contests={contests}
      precinctId={electionSample.precincts[0].id}
      votes={{}}
      returnToContest={jest.fn()}
    />
  );
  expect(screen.getByText('You may still vote in this contest.')).toBeTruthy();
});

test('candidate contest with votes but still undervoted', () => {
  const contest = electionSample.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  assert(contest);
  const contests = [contest];
  render(
    <Review
      election={electionSample}
      contests={contests}
      precinctId={electionSample.precincts[0].id}
      votes={{
        [contest.id]: [contest.candidates[0]],
      }}
      returnToContest={jest.fn()}
    />
  );
  screen.getByText(/You may still vote for \d+ more candidates?./);
});

test('candidate contest fully voted', () => {
  const contest = find(
    electionSample.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const contests = [contest];
  render(
    <Review
      election={electionSample}
      contests={contests}
      precinctId={electionSample.precincts[0].id}
      votes={{
        [contest.id]: contest.candidates.slice(0, contest.seats),
      }}
      returnToContest={jest.fn()}
    />
  );
  expect(screen.queryByText(/You may still vote/)).not.toBeInTheDocument();
});

test.each([['yes'], ['no'], [undefined]])(
  'yesno contest with vote: %s',
  (vote) => {
    const electionDefinition = electionSampleDefinition;
    const contest = find(
      electionDefinition.election.contests,
      (c) => c.type === 'yesno'
    );
    const contests = [contest];
    const returnToContest = jest.fn();
    render(
      <Review
        election={electionDefinition.election}
        contests={contests}
        precinctId={electionDefinition.election.precincts[0].id}
        votes={{
          [contest.id]: vote ? [vote as YesOrNo] : [],
        }}
        returnToContest={returnToContest}
      />
    );
    screen.getByText(contest.title);
    screen.getByText(
      !vote
        ? 'You may still vote in this contest.'
        : vote === 'yes'
        ? 'Yes'
        : 'No'
    );

    userEvent.click(screen.getByText('Change'));
    expect(returnToContest).toHaveBeenCalledWith(contest.id);
  }
);

test.each([
  ['yes', 'yes'],
  ['yes', 'no'],
  ['no', 'yes'],
  ['no', 'no'],
  ['yes', undefined],
  [undefined, undefined],
])(
  'ms-either-neither contest with votes: %s/%s',
  (eitherNeitherVote, pickOneVote) => {
    const electionDefinition = electionWithMsEitherNeitherDefinition;
    const contests = mergeMsEitherNeitherContests(
      electionDefinition.election.contests
    );

    render(
      <Review
        election={electionDefinition.election}
        contests={contests}
        precinctId={electionDefinition.election.precincts[0].id}
        votes={{
          '750000015': eitherNeitherVote ? [eitherNeitherVote as YesOrNo] : [],
          '750000016': pickOneVote ? [pickOneVote as YesOrNo] : [],
        }}
        returnToContest={jest.fn()}
      />
    );

    const eitherNeitherContest = find(
      contests,
      (c) => c.type === 'ms-either-neither'
    );
    const contestVoteSummary = within(
      screen.getByTestId(`contest-${eitherNeitherContest.id}`)
    );

    if (eitherNeitherVote) {
      contestVoteSummary.getByText(
        eitherNeitherVote === 'yes'
          ? /for approval of either/i
          : /against both/i
      );
    }
    if (pickOneVote) {
      contestVoteSummary.getByText(
        pickOneVote === 'yes'
          ? /for initiative measure/i
          : /for alternative measure/i
      );
    }

    if (!eitherNeitherVote || !pickOneVote) {
      contestVoteSummary.getByText('You may still vote in this contest.');
    }
  }
);
