import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { AdjudicationReason, CandidateContest } from '@votingworks/types';
import {
  integers,
  take,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import React from 'react';
import { mockOf } from '@votingworks/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScanWarningScreen, Props } from './scan_warning_screen';
import { renderInAppContext } from '../../test/helpers/render_in_app_context';
import { createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, queryClientDefaultOptions } from '../api';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

const apiMock = createApiMock();

beforeEach(() => {
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<Props> = {}) {
  return renderInAppContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: queryClientDefaultOptions })}
      >
        <ScanWarningScreen
          adjudicationReasonInfo={[]}
          electionDefinition={electionSampleDefinition}
          {...props}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('overvote', () => {
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

  screen.getByRole('heading', { name: 'Too Many Votes' });
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

test('overvote when casting overvotes is disallowed', () => {
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

  screen.getByRole('heading', { name: 'Too Many Votes' });
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

test('blank ballot', () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  renderScreen({
    adjudicationReasonInfo: [{ type: AdjudicationReason.BlankBallot }],
  });

  screen.getByRole('heading', {
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

test('undervote no votes', () => {
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

  screen.getByRole('heading', { name: 'Review Your Ballot' });
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

test('undervote by 1', () => {
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

  screen.getByRole('heading', { name: 'Review Your Ballot' });
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

test('multiple undervotes', () => {
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

  screen.getByRole('heading', { name: 'Review Your Ballot' });
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

test('unreadable', () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  renderScreen({
    adjudicationReasonInfo: [
      { type: AdjudicationReason.UninterpretableBallot },
    ],
  });

  screen.getByRole('heading', { name: 'Scanning Failed' });
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});
