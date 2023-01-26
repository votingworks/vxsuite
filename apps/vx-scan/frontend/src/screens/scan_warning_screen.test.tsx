import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { AdjudicationReason, CandidateContest } from '@votingworks/types';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { mockOf } from '@votingworks/test-utils';
import { integers, take } from '@votingworks/basics';
import { ScanWarningScreen, Props } from './scan_warning_screen';
import { createApiMock, provideApi } from '../../test/helpers/mock_api_client';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

const apiMock = createApiMock();

beforeEach(() => {
  apiMock.mockApiClient.reset();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<Props> = {}) {
  return render(
    provideApi(
      apiMock,
      <ScanWarningScreen
        electionDefinition={electionSampleDefinition}
        adjudicationReasonInfo={[]}
        {...props}
      />
    )
  );
}

test('overvote', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
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

  await screen.findByRole('heading', { name: 'Too Many Votes' });
  screen.getByText(
    new RegExp(
      `There are too many votes marked in the contest: ${contest.title}.`
    )
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});

test('overvote when casting overvotes is disallowed', async () => {
  apiMock.mockApiClient.returnBallot.expectCallWith().resolves();
  mockOf(isFeatureFlagEnabled).mockImplementation(
    (flag: BooleanEnvironmentVariableName) => {
      return flag === BooleanEnvironmentVariableName.DISALLOW_CASTING_OVERVOTES;
    }
  );

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

  await screen.findByRole('heading', { name: 'Too Many Votes' });
  screen.getByText(
    new RegExp(
      `There are too many votes marked in the contest: ${contest.title}.`
    )
  );
  expect(
    screen.queryByRole('button', { name: 'Cast Ballot As Is' })
  ).not.toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Return Ballot' }));
});

test('blank ballot', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  renderScreen({
    adjudicationReasonInfo: [{ type: AdjudicationReason.BlankBallot }],
  });

  await screen.findByRole('heading', {
    name: 'Review Your Ballot',
  });
  screen.getByText('No votes were found when scanning this ballot.');
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});

test('undervote no votes', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
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

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByText(
    new RegExp(`No votes detected in contest: ${contest.title}.`)
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});

test('undervote by 1', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
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

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByText(
    new RegExp(
      `You may vote for more candidates in the contest: ${contest.title}.`
    )
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
});

test('multiple undervotes', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
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

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByText(
    new RegExp(
      `You may vote for more candidates in the contests: ${contests[0].title} and ${contests[1].title}.`
    )
  );
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
});

test('unreadable', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  renderScreen({
    adjudicationReasonInfo: [
      { type: AdjudicationReason.UninterpretableBallot },
    ],
  });

  await screen.findByRole('heading', { name: 'Scanning Failed' });
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});
