import { expect, test, vi } from 'vitest';
import { readElectionStraightParty } from '@votingworks/fixtures';
import { StraightPartyContest as StraightPartyContestInterface } from '@votingworks/types';
import { find } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { screen, within, render } from '../../test/react_testing_library';
import { StraightPartyContest } from './straight_party_contest';

const election = readElectionStraightParty();
const contest = find(
  election.contests,
  (c): c is StraightPartyContestInterface => c.type === 'straight-party'
);

const FEDERALIST_PARTY_ID = '0';

function getOption(accessibleName: string | RegExp) {
  return screen.getByRole('option', { name: accessibleName });
}

test('selecting a party', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      updateVote={updateVote}
    />
  );

  screen.getByRole('heading', { name: contest.title });

  userEvent.click(getOption(/Federalist Party/i));
  expect(updateVote).toHaveBeenCalledTimes(1);
  expect(updateVote).toHaveBeenCalledWith(contest.id, [FEDERALIST_PARTY_ID]);
});

test('deselecting the selected party', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={[FEDERALIST_PARTY_ID]}
      updateVote={updateVote}
    />
  );

  userEvent.click(getOption(/Selected option.+Federalist Party/i));
  expect(updateVote).toHaveBeenCalledTimes(1);
  expect(updateVote).toHaveBeenCalledWith(contest.id, []);
});

test('attempting to overvote shows a warning and does not change the vote', () => {
  const updateVote = vi.fn();
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={[FEDERALIST_PARTY_ID]}
      updateVote={updateVote}
    />
  );

  userEvent.click(getOption(/^Liberty Party/i));
  expect(updateVote).not.toHaveBeenCalled();
  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);

  userEvent.click(screen.getByText('Continue'));
  expect(screen.queryByRole('alertdialog')).toEqual(null);
});

test('audio cues for selected and deselected options', () => {
  vi.useFakeTimers();
  const updateVote = vi.fn();
  const { rerender } = render(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={[]}
      updateVote={updateVote}
    />
  );

  // Initially the option announces just the party name
  getOption(/^Federalist Party/i);

  // Select the party
  userEvent.click(getOption(/^Federalist Party/i));
  rerender(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={[FEDERALIST_PARTY_ID]}
      updateVote={updateVote}
    />
  );
  getOption(
    /Selected option.+Federalist Party.+completed your selections on this contest/i
  );

  // Deselect the party
  userEvent.click(getOption(/Selected option.+Federalist Party/i));
  rerender(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={[]}
      updateVote={updateVote}
    />
  );
  getOption(/Deselected option.+Federalist Party/i);

  // After a moment, the deselected cue clears
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  getOption(/^Federalist Party/i);
  expect(
    screen.queryByRole('option', { name: /Deselected option.+Federalist/i })
  ).toEqual(null);
});

test('shows review mode navigation instructions when isReviewMode is true', () => {
  render(
    <StraightPartyContest
      election={election}
      contest={contest}
      vote={[]}
      updateVote={vi.fn()}
      isReviewMode
    />
  );

  screen.getByText(/return to the review screen, use the right button/i);
});
