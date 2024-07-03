import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import { mockOf } from '@votingworks/test-utils';
import { integers } from '@votingworks/basics';
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

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

jest.mock(
  '../components/misvote_warnings',
  (): typeof import('../components/misvote_warnings') => ({
    ...jest.requireActual('../components/misvote_warnings'),
    WarningDetails: jest.fn(),
    MisvoteWarnings: jest.fn(),
  })
);

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetConfig();
  apiMock.expectGetScannerStatus(statusNoPaper);

  mockOf(MisvoteWarnings).mockImplementation(() => (
    <div data-testid="mockMisvoteWarnings" />
  ));

  mockOf(MisvoteWarningDetails).mockImplementation(() => (
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
        optionIndexes: contest.candidates.map((c, i) => i),
        expected: 1,
      },
    ],
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(mockOf(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [contest],
      partiallyVotedContests: [],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));

  screen.getByTestId('mockMisvoteWarningDetails');
  expect(mockOf(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [contest],
      partiallyVotedContests: [],
    },
    {}
  );

  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
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
        optionIndexes: contest.candidates.map((c, i) => i),
        expected: 1,
      },
    ],
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      precinctScanDisallowCastingOvervotes: true,
    },
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(mockOf(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [contest],
      partiallyVotedContests: [],
    },
    {}
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
        optionIndexes: [],
      },
    ],
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(mockOf(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [contest],
      overvoteContests: [],
      partiallyVotedContests: [],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));

  screen.getByTestId('mockMisvoteWarningDetails');
  expect(mockOf(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [contest],
      overvoteContests: [],
      partiallyVotedContests: [],
    },
    {}
  );

  const confirmButton = screen.getByRole('button', {
    name: 'Yes, Cast Ballot As Is',
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
        optionIndexes: integers().take(contest.seats).toArray(),
      },
    ],
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(mockOf(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: [contest],
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));

  screen.getByTestId('mockMisvoteWarningDetails');
  expect(mockOf(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: [contest],
    },
    {}
  );

  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
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
      optionIndexes: contest.candidates.slice(0, 1).map((c, i) => i),
    })),
  });

  await screen.findByRole('heading', { name: 'Review Your Ballot' });
  screen.getByTestId('mockMisvoteWarnings');
  expect(mockOf(MisvoteWarnings)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: contests,
    },
    {}
  );

  userEvent.click(screen.getByRole('button', { name: 'Cast Ballot As Is' }));
  screen.getByTestId('mockMisvoteWarningDetails');
  expect(mockOf(MisvoteWarningDetails)).toBeCalledWith(
    {
      blankContests: [],
      overvoteContests: [],
      partiallyVotedContests: contests,
    },
    {}
  );

  userEvent.click(
    screen.getByRole('button', { name: 'Yes, Cast Ballot As Is' })
  );
});
