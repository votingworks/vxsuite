import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import { ScanWarningScreen, Props } from './scan_warning_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import {
  WarningDetails as MisvoteWarningDetails,
  MisvoteWarnings,
} from '../components/misvote_warnings';

const electionGeneralDefinition = readElectionGeneralDefinition();

vi.mock('@votingworks/utils', async () => ({
  ...(await vi.importActual('@votingworks/utils')),
  isFeatureFlagEnabled: vi.fn(),
}));

vi.mock('../components/misvote_warnings', async () => ({
  ...(await vi.importActual('../components/misvote_warnings')),
  WarningDetails: vi.fn(),
  MisvoteWarnings: vi.fn(),
}));

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);

  vi.mocked(MisvoteWarnings).mockImplementation(() => (
    <div data-testid="mockMisvoteWarnings" />
  ));

  vi.mocked(MisvoteWarningDetails).mockImplementation(() => (
    <div data-testid="mockMisvoteWarningDetails" />
  ));
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<Props> = {}) {
  return render(
    provideApi(
      apiMock,
      <ScanWarningScreen
        electionDefinition={electionGeneralDefinition}
        systemSettings={DEFAULT_SYSTEM_SETTINGS}
        adjudicationReasonInfo={[]}
        isTestMode={false}
        {...props}
      />
    )
  );
}

test('overvote', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  const contest = electionGeneralDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  renderScreen({
    adjudicationReasonInfo: [
      {
        type: AdjudicationReason.Overvote,
        contestId: contest.id,
        optionIds: contest.candidates.map(({ id }) => id),
        expected: 1,
      },
    ],
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(vi.mocked(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [contest],
      partiallyVotedContests: [],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));

  screen.getByTestId('mockMisvoteWarningDetails');
  expect(vi.mocked(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [contest],
      partiallyVotedContests: [],
    },
    {}
  );

  const confirmButton = screen.getByRole('button', {
    name: 'Cast Ballot',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});

test('overvote when casting overvotes is disallowed', async () => {
  apiMock.mockApiClient.returnBallot.expectCallWith().resolves();

  const contest = electionGeneralDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  renderScreen({
    adjudicationReasonInfo: [
      {
        type: AdjudicationReason.Overvote,
        contestId: contest.id,
        optionIds: contest.candidates.map(({ id }) => id),
        expected: 1,
      },
    ],
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      disallowCastingOvervotes: true,
    },
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(vi.mocked(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [contest],
      partiallyVotedContests: [],
    },
    {}
  );

  expect(
    screen.queryByRole('button', { name: 'Cast Ballot' })
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
  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));
  const confirmButton = screen.getByRole('button', {
    name: 'Cast Ballot',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});

test('undervote no votes', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  const contest = electionGeneralDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  renderScreen({
    adjudicationReasonInfo: [
      {
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        expected: 1,
        optionIds: [],
      },
    ],
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(vi.mocked(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [contest],
      overvoteContests: [],
      partiallyVotedContests: [],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));

  screen.getByTestId('mockMisvoteWarningDetails');
  expect(vi.mocked(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [contest],
      overvoteContests: [],
      partiallyVotedContests: [],
    },
    {}
  );

  const confirmButton = screen.getByRole('button', {
    name: 'Cast Ballot',
  });
  userEvent.click(confirmButton);
  expect(confirmButton).toBeDisabled();
});

test('undervote by 1', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  const contest = electionGeneralDefinition.election.contests.find(
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
      },
    ],
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(vi.mocked(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: [contest],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));

  screen.getByTestId('mockMisvoteWarningDetails');
  expect(vi.mocked(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: [contest],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));
});

test('multiple undervotes', async () => {
  apiMock.mockApiClient.acceptBallot.expectCallWith().resolves();
  const contests = electionGeneralDefinition.election.contests
    .filter((c) => c.type === 'candidate')
    .slice(0, 2);

  renderScreen({
    adjudicationReasonInfo: contests.map((contest) => ({
      type: AdjudicationReason.Undervote,
      contestId: contest.id,
      expected: contest.seats,
      optionIds: contest.candidates.slice(0, 1).map(({ id }) => id),
    })),
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(vi.mocked(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: contests,
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));
  screen.getByTestId('mockMisvoteWarningDetails');
  expect(vi.mocked(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: contests,
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot' }));
});
