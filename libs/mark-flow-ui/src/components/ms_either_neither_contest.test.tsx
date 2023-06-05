import React from 'react';
import { electionWithMsEitherNeither } from '@votingworks/fixtures';
import { find } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { advanceTimers } from '@votingworks/test-utils';
import {
  MsEitherNeitherContest as MsEitherNeitherContestType,
  mergeMsEitherNeitherContests,
} from '../utils/ms_either_neither_contests';
import { MsEitherNeitherContest } from './ms_either_neither_contest';
import { render, screen, within } from '../../test/react_testing_library';

const contests = mergeMsEitherNeitherContests(
  electionWithMsEitherNeither.contests
);
const contest = find(
  contests,
  (c): c is MsEitherNeitherContestType => c.type === 'ms-either-neither'
);

beforeEach(() => {
  jest.useFakeTimers();
});

test('renders', () => {
  render(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      updateVote={jest.fn()}
    />
  );
  const contestChoices = within(screen.getByTestId('contest-choices'));
  const eitherButton = contestChoices
    .getByText(/^for approval of either/i)
    .closest('button')!;
  const neitherButton = contestChoices
    .getByText(/^against both/i)
    .closest('button')!;
  expect(eitherButton).toHaveAttribute('aria-selected', 'false');
  expect(neitherButton).toHaveAttribute('aria-selected', 'false');
});

test('renders with vote', () => {
  render(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['yes']}
      pickOneContestVote={['yes']}
      updateVote={jest.fn()}
    />
  );
  const contestChoices = within(screen.getByTestId('contest-choices'));
  const eitherButton = contestChoices
    .getByText(/^for approval of either/i)
    .closest('button')!;
  expect(eitherButton).toHaveAttribute('aria-selected');
});

test('voting for either/neither', () => {
  const updateVote = jest.fn();
  render(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      updateVote={updateVote}
    />
  );
  const contestChoices = within(screen.getByTestId('contest-choices'));
  const eitherButton = contestChoices
    .getByText(/^for approval of either/i)
    .closest('button')!;
  const neitherButton = contestChoices
    .getByText(/^against both/i)
    .closest('button')!;

  userEvent.click(eitherButton);
  expect(updateVote).toHaveBeenCalledWith(contest.eitherNeitherContestId, [
    'yes',
  ]);

  userEvent.click(neitherButton);
  expect(updateVote).toHaveBeenCalledWith(contest.eitherNeitherContestId, [
    'no',
  ]);
});

test.each([
  ['yes', 'yes'],
  ['yes', 'no'],
  ['no', 'yes'],
  ['no', 'no'],
  ['yes', undefined],
  ['no', undefined],
  [undefined, 'yes'],
  [undefined, 'no'],
] as const)(
  'voting with existing votes: %s/%s',
  (eitherNeitherContestVote, pickOneContestVote) => {
    const updateVote = jest.fn();
    render(
      <MsEitherNeitherContest
        election={electionWithMsEitherNeither}
        contest={contest}
        eitherNeitherContestVote={
          eitherNeitherContestVote && [eitherNeitherContestVote]
        }
        pickOneContestVote={pickOneContestVote && [pickOneContestVote]}
        updateVote={updateVote}
      />
    );
    const contestChoices = within(screen.getByTestId('contest-choices'));
    const eitherButton = contestChoices
      .getByText(/^for approval of either/i)
      .closest('button')!;
    const neitherButton = contestChoices
      .getByText(/^against both/i)
      .closest('button')!;
    const pickFirstButton = contestChoices
      .getByText(/^for initiative/i)
      .closest('button')!;
    const pickSecondButton = contestChoices
      .getByText(/^for alternative/i)
      .closest('button')!;

    userEvent.click(eitherButton);
    expect(updateVote).toHaveBeenCalledWith(
      contest.eitherNeitherContestId,
      eitherNeitherContestVote === 'yes' ? [] : ['yes']
    );

    userEvent.click(neitherButton);
    expect(updateVote).toHaveBeenCalledWith(
      contest.eitherNeitherContestId,
      eitherNeitherContestVote === 'no' ? [] : ['no']
    );

    userEvent.click(pickFirstButton);
    expect(updateVote).toHaveBeenCalledWith(
      contest.pickOneContestId,
      pickOneContestVote === 'yes' ? [] : ['yes']
    );

    userEvent.click(pickSecondButton);
    expect(updateVote).toHaveBeenCalledWith(
      contest.pickOneContestId,
      pickOneContestVote === 'no' ? [] : ['no']
    );
  }
);

test('audio cues', () => {
  const updateVote = jest.fn();
  const { rerender } = render(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      updateVote={updateVote}
    />
  );
  const contestChoices = within(screen.getByTestId('contest-choices'));
  const eitherButton = contestChoices
    .getByText(/^for approval of either/i)
    .closest('button')!;
  const neitherButton = contestChoices
    .getByText(/^against both/i)
    .closest('button')!;
  const pickFirstButton = contestChoices
    .getByText(/^for initiative/i)
    .closest('button')!;
  const pickSecondButton = contestChoices
    .getByText(/^for alternative/i)
    .closest('button')!;

  // no votes, so no selection cues
  expect(eitherButton).toHaveAccessibleName(
    expect.stringMatching(/^for approval of either/i)
  );
  expect(neitherButton).toHaveAccessibleName(
    expect.stringMatching(/^against both/i)
  );
  expect(pickFirstButton).toHaveAccessibleName(
    expect.stringMatching(/^for initiative/i)
  );
  expect(pickSecondButton).toHaveAccessibleName(
    expect.stringMatching(/^for alternative/i)
  );

  // re-render with votes, expect selection cues
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['yes']}
      pickOneContestVote={['yes']}
      updateVote={updateVote}
    />
  );
  expect(eitherButton).toHaveAccessibleName(
    expect.stringMatching(/^selected, for approval of either/i)
  );
  expect(neitherButton).toHaveAccessibleName(
    expect.stringMatching(/^against both/i)
  );
  expect(pickFirstButton).toHaveAccessibleName(
    expect.stringMatching(/^selected, for initiative/i)
  );
  expect(pickSecondButton).toHaveAccessibleName(
    expect.stringMatching(/^for alternative/i)
  );

  // re-render with different votes, expect different selection cues
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['no']}
      pickOneContestVote={['no']}
      updateVote={updateVote}
    />
  );
  expect(eitherButton).toHaveAccessibleName(
    expect.stringMatching(/^for approval of either/i)
  );
  expect(neitherButton).toHaveAccessibleName(
    expect.stringMatching(/^selected, against both/i)
  );
  expect(pickFirstButton).toHaveAccessibleName(
    expect.stringMatching(/^for initiative/i)
  );
  expect(pickSecondButton).toHaveAccessibleName(
    expect.stringMatching(/^selected, for alternative/i)
  );

  // deselecting "either" should add a "deselected" cue
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['yes']}
      pickOneContestVote={['no']}
      updateVote={updateVote}
    />
  );
  userEvent.click(eitherButton);
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={[]}
      pickOneContestVote={['no']}
      updateVote={updateVote}
    />
  );
  expect(eitherButton).toHaveAccessibleName(
    expect.stringMatching(/^deselected, for approval of either/i)
  );

  // after a timeout, the cue should be removed
  advanceTimers(1);
  expect(eitherButton).toHaveAccessibleName(
    expect.stringMatching(/^for approval of either/i)
  );

  // deselecting "neither" should add a "deselected" cue
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['no']}
      pickOneContestVote={['no']}
      updateVote={updateVote}
    />
  );
  userEvent.click(neitherButton);
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={[]}
      pickOneContestVote={['no']}
      updateVote={updateVote}
    />
  );
  expect(neitherButton).toHaveAccessibleName(
    expect.stringMatching(/^deselected, against both/i)
  );

  // after a timeout, the cue should be removed
  advanceTimers(1);
  expect(neitherButton).toHaveAccessibleName(
    expect.stringMatching(/^against both/i)
  );

  // deselecting "first" should add a "deselected" cue
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['yes']}
      pickOneContestVote={['yes']}
      updateVote={updateVote}
    />
  );
  userEvent.click(pickFirstButton);
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['yes']}
      pickOneContestVote={[]}
      updateVote={updateVote}
    />
  );
  expect(pickFirstButton).toHaveAccessibleName(
    expect.stringMatching(/^deselected, for initiative/i)
  );

  // after a timeout, the cue should be removed
  advanceTimers(1);
  expect(pickFirstButton).toHaveAccessibleName(
    expect.stringMatching(/^for initiative/i)
  );

  // deselecting "second" should add a "deselected" cue
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['no']}
      pickOneContestVote={['no']}
      updateVote={updateVote}
    />
  );
  userEvent.click(pickSecondButton);
  rerender(
    <MsEitherNeitherContest
      election={electionWithMsEitherNeither}
      contest={contest}
      eitherNeitherContestVote={['no']}
      pickOneContestVote={[]}
      updateVote={updateVote}
    />
  );
  expect(pickSecondButton).toHaveAccessibleName(
    expect.stringMatching(/^deselected, for alternative/i)
  );

  // after a timeout, the cue should be removed
  advanceTimers(1);
  expect(pickSecondButton).toHaveAccessibleName(
    expect.stringMatching(/^for alternative/i)
  );
});
