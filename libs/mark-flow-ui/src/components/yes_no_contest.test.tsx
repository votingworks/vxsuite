import { electionTwoPartyPrimary } from '@votingworks/fixtures';
import { YesNoContest as YesNoContestInterface } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { advanceTimers } from '@votingworks/test-utils';
import { screen, within, render } from '../../test/react_testing_library';
import { YesNoContest } from './yes_no_contest';

const contest = electionTwoPartyPrimary.contests.find(
  (c) => c.id === 'fishing' && c.type === 'yesno'
) as YesNoContestInterface;

function getOption(accessibleName: string | RegExp) {
  return screen.getByRole('option', { name: accessibleName });
}

test('voting for both yes and no', () => {
  const updateVote = jest.fn();
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={updateVote}
    />
  );
  screen.getByRole('heading', { name: contest.title });
  // Using `getAll*` because the description appears both in the contest header
  // as an < AudioOnly > element and in the contest body as a visible element.
  screen.getAllByText(contest.description);

  const contestChoices = screen.getByTestId('contest-choices');
  userEvent.click(within(contestChoices).getByText('YES').closest('button')!);
  expect(updateVote).toHaveBeenCalledTimes(1);

  userEvent.click(within(contestChoices).getByText('NO').closest('button')!);
  expect(updateVote).toHaveBeenCalledTimes(2);
});

test('changing votes', () => {
  const updateVote = jest.fn();
  render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.yesOption.id]}
      updateVote={updateVote}
    />
  );
  const contestChoices = screen.getByTestId('contest-choices');
  userEvent.click(within(contestChoices).getByText('NO').closest('button')!);
  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);
  userEvent.click(screen.getByText('Okay'));
});

test('audio cue for vote', () => {
  jest.useFakeTimers();

  const updateVote = jest.fn();
  const { rerender } = render(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      updateVote={updateVote}
    />
  );

  const yesButton = getOption(/YES/i);

  // initial state just has a description of the choice
  getOption(/Ballot Measure 3.+yes/i);
  userEvent.click(yesButton);

  // manually handle updating the vote
  rerender(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[contest.yesOption.id]}
      updateVote={updateVote}
    />
  );

  // now the choice is selected
  getOption(/Selected.+Ballot Measure 3.+yes/i);

  // unselect the choice
  userEvent.click(yesButton);

  // manually handle updating the vote
  rerender(
    <YesNoContest
      election={electionTwoPartyPrimary}
      contest={contest}
      vote={[]}
      updateVote={updateVote}
    />
  );

  // now the choice is deselected
  getOption(/Deselected.+Ballot Measure 3.+yes/i);

  // after a second, the choice is no longer selected or deselected
  advanceTimers(1);
  getOption(/Ballot Measure 3.+yes/i);
});
