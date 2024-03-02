import {
  electionGeneralDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { CandidateContest, YesNoContest } from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen, within, render } from '../../test/react_testing_library';
import { mergeMsEitherNeitherContests } from '../utils/ms_either_neither_contests';
import { Review } from './review';

const electionGeneral = electionGeneralDefinition.election;

test('renders', () => {
  const contests = mergeMsEitherNeitherContests(electionGeneral.contests);
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{}}
      returnToContest={jest.fn()}
    />
  );
  expect(
    screen.getAllByText('You may still vote in this contest.')
  ).toHaveLength(contests.length);
});

test('candidate contest with no votes', () => {
  const contest = electionGeneral.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);
  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{}}
      returnToContest={jest.fn()}
    />
  );
  expect(screen.getByText('You may still vote in this contest.')).toBeTruthy();
});

test('candidate contest with votes but still undervoted', () => {
  const contest: CandidateContest = {
    ...find(
      electionGeneral.contests,
      (c): c is CandidateContest => c.type === 'candidate'
    ),
    seats: 3,
  };

  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{
        [contest.id]: [contest.candidates[0]],
      }}
      returnToContest={jest.fn()}
    />
  );

  screen.getByText(
    hasTextAcrossElements(/votes remaining in this contest: 2/i)
  );
});

test('candidate contest fully voted', () => {
  const contest = find(
    electionGeneral.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{
        [contest.id]: contest.candidates.slice(0, contest.seats),
      }}
      returnToContest={jest.fn()}
    />
  );
  expect(screen.queryByText(/You may still vote/)).not.toBeInTheDocument();
});

describe('yesno contest', () => {
  const electionDefinition = electionGeneralDefinition;
  const contest = find(
    electionDefinition.election.contests,
    (c): c is YesNoContest => c.type === 'yesno'
  );

  test.each([[contest.yesOption.id], [contest.noOption.id], [undefined]])(
    'with vote: %s',
    (vote) => {
      const contests = [contest];
      const returnToContest = jest.fn();
      render(
        <Review
          election={electionDefinition.election}
          contests={contests}
          precinctId={electionDefinition.election.precincts[0].id}
          votes={{
            [contest.id]: vote ? [vote] : [],
          }}
          returnToContest={returnToContest}
        />
      );
      const contestCard = screen
        .getByText(contest.title)
        .closest('div[role="button"]') as HTMLElement;
      within(contestCard).getByText(
        !vote
          ? 'You may still vote in this contest.'
          : vote === contest.yesOption.id
          ? 'Yes'
          : 'No'
      );

      userEvent.click(within(contestCard).getButton(/Change/));
      expect(returnToContest).toHaveBeenCalledWith(contest.id);
    }
  );
});

describe('ms-either-neither contest', () => {
  const electionDefinition = electionWithMsEitherNeitherDefinition;
  const eitherNeitherContest = find(
    electionDefinition.election.contests,
    (c) => c.id === '750000015'
  );
  const pickOneContest = find(
    electionDefinition.election.contests,
    (c) => c.id === '750000016'
  );
  assert(eitherNeitherContest.type === 'yesno');
  assert(pickOneContest.type === 'yesno');

  const contests = mergeMsEitherNeitherContests(
    electionDefinition.election.contests
  );

  test.each([
    [eitherNeitherContest.yesOption.id, pickOneContest.yesOption.id],
    [eitherNeitherContest.yesOption.id, pickOneContest.noOption.id],
    [eitherNeitherContest.noOption.id, pickOneContest.yesOption.id],
    [eitherNeitherContest.noOption.id, pickOneContest.noOption.id],
    [eitherNeitherContest.yesOption.id, undefined],
    [undefined, undefined],
  ])('with votes: %s/%s', (eitherNeitherVote, pickOneVote) => {
    render(
      <Review
        election={electionDefinition.election}
        contests={contests}
        precinctId={electionDefinition.election.precincts[0].id}
        votes={{
          '750000015': eitherNeitherVote ? [eitherNeitherVote] : [],
          '750000016': pickOneVote ? [pickOneVote] : [],
        }}
        returnToContest={jest.fn()}
      />
    );

    const mergedContest = find(contests, (c) => c.type === 'ms-either-neither');
    const contestVoteSummary = within(
      screen.getByTestId(`contest-${mergedContest.id}`)
    );

    if (eitherNeitherVote) {
      contestVoteSummary.getByText(
        eitherNeitherVote === eitherNeitherContest.yesOption.id
          ? /for approval of either/i
          : /against both/i
      );
    }
    if (pickOneVote) {
      contestVoteSummary.getByText(
        pickOneVote === pickOneContest.yesOption.id
          ? /for initiative measure/i
          : /for alternative measure/i
      );
    }

    if (!eitherNeitherVote || !pickOneVote) {
      contestVoteSummary.getByText('You may still vote in this contest.');
    }
  });
});

describe('keyboard navigation', () => {
  test.each([['[Enter]'], ['[Space]']] as const)(
    '%s key activates contest review button',
    async (key) => {
      const contest = electionGeneral.contests.find(
        (c): c is CandidateContest => c.type === 'candidate'
      );
      assert(contest);
      const contests = [contest];
      const returnToContestStub = jest.fn();
      render(
        <Review
          election={electionGeneral}
          contests={contests}
          precinctId={electionGeneral.precincts[0].id}
          votes={{}}
          returnToContest={returnToContestStub}
        />
      );

      userEvent.tab();
      expect(
        await screen.findByTestId(`contest-wrapper-${contests[0].id}`)
      ).toHaveFocus();
      userEvent.keyboard(key);
      expect(returnToContestStub).toHaveBeenCalledTimes(1);
    }
  );
});
