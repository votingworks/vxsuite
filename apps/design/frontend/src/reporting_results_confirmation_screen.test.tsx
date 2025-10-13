import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { err, ok } from '@votingworks/basics';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  getContestsForPrecinctAndElection,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import type { ReceivedReportInfo } from '@votingworks/design-backend';
import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { render } from '../test/react_testing_library';
import { generalElectionRecord } from '../test/fixtures';
import { ReportingResultsConfirmationScreen } from './reporting_results_confirmation_screen';
import {
  createMockUnauthenticatedApiClient,
  MockUnauthenticatedApiClient,
  provideUnauthenticatedApi,
} from '../test/unauthenticated_api_helpers';

const electionRecord = generalElectionRecord('test-org');
const { election } = electionRecord;

let apiMock: MockUnauthenticatedApiClient;

// Mock window.location.search
Object.defineProperty(window, 'location', {
  value: {
    search: '',
  },
  writable: true,
});

// Helper to set URL parameters
function setUrlParams(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.location as any).search = `?${searchParams.toString()}`;
}

// Mock data for different report types
const mockPollsOpenReport: ReceivedReportInfo = {
  pollsState: 'polls_open',
  ballotHash: 'abc123def456',
  machineId: 'VxScan-001',
  isLive: true,
  signedTimestamp: new Date('2024-11-05T08:00:00Z'),
  election,
  precinctSelection: ALL_PRECINCTS_SELECTION,
};

const mockPollsClosedReportGeneral: ReceivedReportInfo = {
  pollsState: 'polls_closed_final',
  ballotHash: 'abc123def456',
  machineId: 'VxScan-001',
  isLive: true,
  signedTimestamp: new Date('2024-11-05T20:00:00Z'),
  election,
  precinctSelection: ALL_PRECINCTS_SELECTION,
  contestResults: buildElectionResultsFixture({
    election,
    contestResultsSummaries: {},
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    includeGenericWriteIn: false,
  }).contestResults,
};

const primaryElection = electionPrimaryPrecinctSplitsFixtures.readElection();

const mockPollsClosedReportPrimary: ReceivedReportInfo = {
  pollsState: 'polls_closed_final',
  ballotHash: 'abc123def456',
  machineId: 'VxScan-002',
  isLive: true,
  signedTimestamp: new Date('2024-11-05T20:00:00Z'),
  election: primaryElection,
  precinctSelection: singlePrecinctSelectionFor(
    primaryElection.precincts[0].id
  ),
  contestResults: buildElectionResultsFixture({
    election: primaryElection,
    contestResultsSummaries: {},
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    includeGenericWriteIn: false,
  }).contestResults,
};

beforeEach(() => {
  // Reset mocks
  vi.clearAllMocks();
  apiMock = createMockUnauthenticatedApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
  cleanup();
  // Reset URL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.location as any).search = '';
});

const invalidParameterTestCases: Array<{
  description: string;
  params: Record<string, string>;
}> = [
  {
    description: 'payload parameter is missing',
    params: { s: 'test-signature', c: 'test-certificate' },
  },
  {
    description: 'signature parameter is missing',
    params: { p: 'test-payload', c: 'test-certificate' },
  },
  {
    description: 'certificate parameter is missing',
    params: { p: 'test-payload', s: 'test-signature' },
  },
  {
    description: 'no parameters are provided',
    params: {},
  },
];

test.each(invalidParameterTestCases)(
  'Screen shows Invalid Request when $description',
  ({ params }) => {
    setUrlParams(params);

    apiMock.processQrCodeReport.reset(); // should not be called
    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    expect(
      screen.getByRole('heading', { name: 'Error Sending Report' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Invalid request. Please try scanning the QR code again.'
      )
    ).toBeInTheDocument();
  }
);

describe('ReportingResultsConfirmationScreen with proper parameters', () => {
  beforeEach(() => {
    setUrlParams({
      p: 'test-payload',
      s: 'test-signature',
      c: 'test-certificate',
    });
  });

  test('shows Invalid Signature error when signature verification fails', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(err('invalid-signature'));

    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Error Sending Report' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Signature not verified. Please try scanning the QR code again.'
        )
      ).toBeInTheDocument();
    });
  });

  test('shows No Election Found error when election is not found', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(err('no-election-found'));

    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Error Sending Report' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Wrong election. Confirm VxScan and VxDesign are configured with the same election package.'
        )
      ).toBeInTheDocument();
    });
  });

  test('shows Invalid Request for other error types', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(err('invalid-payload'));

    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Error Sending Report' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Invalid request. Please try scanning the QR code again.'
        )
      ).toBeInTheDocument();
    });
  });

  test('displays polls open report correctly', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(ok(mockPollsOpenReport));
    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Polls Opened Report Sent' })
      ).toBeInTheDocument();
      expect(
        screen.getByText('The polls opened report has been sent to VxDesign.')
      ).toBeInTheDocument();
    });

    // Check report details
    expect(screen.getByText('All Precincts')).toBeInTheDocument();
    expect(screen.getByText('VxScan-001')).toBeInTheDocument();
    // The ballot hash might be truncated by formatBallotHash function
    expect(screen.getByText(/abc123d/)).toBeInTheDocument();

    // Check timestamp formatting - using more flexible matcher
    expect(screen.getByText(/Nov 5, 2024/)).toBeInTheDocument();

    // does not show test mode banner
    await waitFor(() => {
      expect(screen.queryByText('Test Report')).not.toBeInTheDocument();
    });
  });

  test('polls open report shows test mode banner for test reports', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(
        ok({
          ...mockPollsOpenReport,
          isLive: false,
        })
      );

    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(screen.getByText('Test Report')).toBeInTheDocument();
    });
  });

  test('displays polls closed report correctly - general election', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(ok(mockPollsClosedReportGeneral));
    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Polls Closed Report Sent' })
      ).toBeInTheDocument();
      expect(
        screen.getByText('The polls closed report has been sent to VxDesign.')
      ).toBeInTheDocument();
    });

    // Check report details
    expect(screen.getByText('All Precincts')).toBeInTheDocument();
    expect(screen.getByText('VxScan-001')).toBeInTheDocument();
    // The ballot hash might be truncated by formatBallotHash function
    expect(screen.getByText(/abc123d/)).toBeInTheDocument();

    // Check that contest results tables are rendered
    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThan(0);

    expect(
      screen.queryByRole('heading', { name: 'Nonpartisan Contests' })
    ).not.toBeInTheDocument();

    // All contests should be listed.
    for (const contest of election.contests) {
      expect(screen.getByText(contest.title)).toBeInTheDocument();
    }
  });

  test('polls closed report shows test mode banner for test reports', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(
        ok({
          ...mockPollsClosedReportGeneral,
          isLive: false,
        })
      );

    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(screen.getByText('Test Report')).toBeInTheDocument();
    });
  });

  test('polls closed report handles single precinct primary properly', async () => {
    apiMock.processQrCodeReport
      .expectCallWith({
        payload: 'test-payload',
        signature: 'test-signature',
        certificate: 'test-certificate',
      })
      .resolves(ok(mockPollsClosedReportPrimary));

    render(
      provideUnauthenticatedApi(apiMock, <ReportingResultsConfirmationScreen />)
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Polls Closed Report Sent' })
      ).toBeInTheDocument();
      expect(
        screen.getByText('The polls closed report has been sent to VxDesign.')
      ).toBeInTheDocument();
    });

    // Check report details
    expect(
      screen.getByText(primaryElection.precincts[0].name)
    ).toBeInTheDocument();
    expect(screen.getByText('VxScan-002')).toBeInTheDocument();
    // The ballot hash might be truncated by formatBallotHash function
    expect(screen.getByText(/abc123d/)).toBeInTheDocument();

    // Check that contest results tables are rendered
    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThan(0);

    const contestsInPrecinct = getContestsForPrecinctAndElection(
      primaryElection,
      singlePrecinctSelectionFor(primaryElection.precincts[0].id)
    );
    const contestsOutsidePrecinct = election.contests.filter(
      (c) => !contestsInPrecinct.some((cp) => cp.id === c.id)
    );
    // Contests in the precinct should have results listed.
    for (const contest of contestsInPrecinct) {
      expect(screen.queryByText(contest.title)).toBeInTheDocument();
    }
    for (const contest of contestsOutsidePrecinct) {
      expect(screen.queryByText(contest.title)).not.toBeInTheDocument();
    }
    // Contests should have headers, this election has non partisan contests.
    await screen.findByText('Mammal Party Contests');
    await screen.findByText('Fish Party Contests');
    await screen.findByText('Nonpartisan Contests');
  });
});
