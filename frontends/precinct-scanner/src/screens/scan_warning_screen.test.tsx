import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { AdjudicationReason, CandidateContest } from '@votingworks/types';
import { integers, take } from '@votingworks/utils';
import React from 'react';
import fetchMock from 'fetch-mock';
import { Inserted } from '@votingworks/test-utils';
import { ScanWarningScreen, Props } from './scan_warning_screen';
import { AppContext } from '../contexts/app_context';

function renderScreen(props: Props) {
  return render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
        auth: Inserted.fakeLoggedOutAuth(),
      }}
    >
      <ScanWarningScreen {...props} />
    </AppContext.Provider>
  );
}

test('overvote', () => {
  fetchMock.postOnce('/scanner/accept', { body: { status: 'ok' } });
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  renderScreen({
    adjudicationReasonInfo: [
      {
        type: AdjudicationReason.Overvote,
        contestId: contest.id,
        optionIds: contest.candidates.map(({ id }) => id),
        optionIndexes: contest.candidates.map((c, i) => i),
        expected: 1,
      },
    ],
  });

  screen.getByRole('heading', { name: 'Too Many Votes' });
  screen.getByText(
    new RegExp(
      `There are too many votes marked in the contest for: ${contest.title}.`
    )
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
  expect(fetchMock.done()).toBe(true);
});

test('blank ballot', () => {
  fetchMock.postOnce('/scanner/accept', { body: { status: 'ok' } });
  renderScreen({
    adjudicationReasonInfo: [{ type: AdjudicationReason.BlankBallot }],
  });

  screen.getByRole('heading', {
    name: 'Review Your Ballot',
  });
  screen.getByText('No votes were found when scanning this ballot.');
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, count blank ballot' })
  );
  expect(fetchMock.done()).toBe(true);
});

test('undervote no votes', () => {
  fetchMock.postOnce('/scanner/accept', { body: { status: 'ok' } });
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  renderScreen({
    adjudicationReasonInfo: [
      {
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        expected: 1,
        optionIds: [],
        optionIndexes: [],
      },
    ],
  });

  screen.getByRole('heading', { name: 'Review Your Ballot' });
  screen.getByText(new RegExp(`No votes detected for: ${contest.title}.`));
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
  expect(fetchMock.done()).toBe(true);
});

test('undervote by 1', () => {
  fetchMock.postOnce('/scanner/accept', { body: { status: 'ok' } });
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  )!;

  renderScreen({
    adjudicationReasonInfo: [
      {
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        expected: contest.seats,
        optionIds: contest.candidates
          .slice(0, contest.seats - 1)
          .map(({ id }) => id),
        optionIndexes: take(contest.seats, integers()),
      },
    ],
  });

  screen.getByRole('heading', { name: 'Review Your Ballot' });
  screen.getByText(
    new RegExp(
      `You may vote for more candidates in the contests for: ${contest.title}.`
    )
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
  expect(fetchMock.done()).toBe(true);
});

test('multiple undervotes', () => {
  fetchMock.postOnce('/scanner/accept', { body: { status: 'ok' } });
  const contests = electionSampleDefinition.election.contests
    .filter((c): c is CandidateContest => c.type === 'candidate')
    .slice(0, 2);

  renderScreen({
    adjudicationReasonInfo: contests.map((contest) => ({
      type: AdjudicationReason.Undervote,
      contestId: contest.id,
      expected: contest.seats,
      optionIds: contest.candidates.slice(0, 1).map(({ id }) => id),
      optionIndexes: contest.candidates.slice(0, 1).map((c, i) => i),
    })),
  });

  screen.getByRole('heading', { name: 'Review Your Ballot' });
  screen.getByText(
    new RegExp(
      `You may vote for more candidates in the contests for: ${contests[0].title} and ${contests[1].title}.`
    )
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
  expect(fetchMock.done()).toBe(true);
});

test('unreadable', () => {
  fetchMock.postOnce('/scanner/accept', { body: { status: 'ok' } });

  renderScreen({
    adjudicationReasonInfo: [
      { type: AdjudicationReason.UninterpretableBallot },
    ],
  });

  screen.getByRole('heading', { name: 'Scanning Failed' });
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
  expect(fetchMock.done()).toBe(true);
});
