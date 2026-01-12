import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { cleanup, screen, waitFor } from '@testing-library/react';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  ElectionId,
  Election,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
  buildElectionResultsFixture,
  type ContestResultsSummaries,
  getContestsForPrecinctAndElection,
} from '@votingworks/utils';
import type { QuickReportedPollStatus } from '@votingworks/design-backend';
import { err, ok } from '@votingworks/basics';
import { ALL_PRECINCTS_REPORT_KEY } from './utils';
import { render } from '../test/react_testing_library';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
} from '../test/api_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { LiveReportsScreen } from './live_reports_screen';
import {
  electionInfoFromRecord,
  generalElectionRecord,
  primaryElectionRecord,
} from '../test/fixtures';
import { VXQR_REFETCH_INTERVAL_MS } from './api';

const electionRecord = generalElectionRecord(jurisdiction.id);
const primaryElectionRecordGenerated = primaryElectionRecord(jurisdiction.id);
const electionId = electionRecord.election.id;
const { election } = electionRecord;
const primaryElection = primaryElectionRecordGenerated.election;

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getUser.expectRepeatedCallsWith().resolves(user);
  mockUserFeatures(apiMock);
});

afterEach(() => {
  apiMock.assertComplete();
  cleanup();
});

function renderScreen(
  electionIdParam: ElectionId = electionId
): ReturnType<typeof createMemoryHistory> {
  apiMock.getElectionInfo
    .expectCallWith({ electionId: electionIdParam })
    .resolves(electionInfoFromRecord(electionRecord));
  const { path } = routes.election(electionIdParam).reports.root;
  const paramPath = routes.election(':electionId').reports.root.path;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<LiveReportsScreen />, {
        paramPath,
        path,
      })
    )
  );
  return history;
}

// Mock data for testing
const mockSystemSettingsWithUrl: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  quickResultsReportingUrl: 'https://example-results.com',
};

const mockSystemSettingsWithoutUrl: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  quickResultsReportingUrl: '',
};

// Helper function to create mock aggregated results
function createMockAggregatedResults(
  electionData: typeof election,
  isLive = false
) {
  // Create realistic contest results for the general election contests
  const contestResultsSummaries: ContestResultsSummaries = {};

  const electionResults = buildElectionResultsFixture({
    election: electionData,
    cardCounts: {
      bmd: 0,
      hmpb: [],
    },
    contestResultsSummaries,
    includeGenericWriteIn: true,
  });

  return {
    ballotHash: 'test-ballot-hash-123',
    contestResults: electionResults.contestResults,
    election: electionData,
    machinesReporting: ['VxScan-001', 'VxScan-002', 'VxScan-003'],
    isLive,
  };
}

// Helper function to create mock polls status data
function createMockPollsStatus(electionItem: Election, isLive = false) {
  const reportsByPrecinct: Record<string, QuickReportedPollStatus[]> = {};

  // Add empty arrays for each precinct
  for (const precinct of electionItem.precincts) {
    reportsByPrecinct[precinct.id] = [];
  }

  return {
    election: electionItem,
    ballotHash: 'abc123def456',
    isLive,
    reportsByPrecinct,
  };
}

const mockPollsStatus = createMockPollsStatus(election);

describe('Navigation tab visibility', () => {
  test('Results tab appears in navigation when quickResultsReportingUrl is configured', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatus));

    renderScreen();

    // Wait for the component to potentially load
    await screen.findByRole('heading', { name: 'Live Reports' });

    await screen.findByRole('button', {
      name: 'Live Reports',
    });
  });

  test('screen still works when quickResultsReportingUrl is not configured', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithoutUrl);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });
    await screen.findByText(
      'This election does not have live reports enabled.'
    );

    // There should not be a link to this page in the navigation.
    expect(
      screen.queryByRole('button', { name: 'Live Reports' })
    ).not.toBeInTheDocument();
  });
});

test('shows error message when election is not exported', async () => {
  apiMock.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(mockSystemSettingsWithUrl);

  apiMock.getLiveReportsSummary
    .expectRepeatedCallsWith({ electionId })
    .resolves(err('no-election-export-found'));
  renderScreen();

  await screen.findByRole('heading', { name: 'Live Reports' });
  await screen.findByText(/This election has not yet been exported/);
});

test('shows error message when exported election is out of date', async () => {
  apiMock.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(mockSystemSettingsWithUrl);

  apiMock.getLiveReportsSummary
    .expectRepeatedCallsWith({ electionId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .resolves(err('election-out-of-date') as any);
  renderScreen();

  await screen.findByRole('heading', { name: 'Live Reports' });
  await screen.findByText(
    /This election is no longer compatible with Live Reports/
  );
  await screen.findByText(/Please export a new election package/);
});

describe('Polls status summary display', () => {
  test('shows poll status summary correctly when there is no "all precinct" data, test mode', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Create mock data with individual precinct reports but no aggregated data
    const mockPollsStatusWithIndividualReports: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPrecinct: {
        // First precinct has reports (polls closed)
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_closed_final',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        // Second precinct has reports (polls open)
        [election.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsState: 'polls_open',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[1].id
            ),
            signedTimestamp: new Date('2024-01-01T17:30:00Z'),
          },
        ],
        // Third precinct has no reports
        [election.precincts[2].id]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithIndividualReports));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Check that "View Full Election Tally Report" button is enabled
    const viewFullReportButton = screen.getByRole('button', {
      name: 'View Full Election Tally Report',
    });
    expect(viewFullReportButton).toBeEnabled();

    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-closing-count')).toHaveTextContent('0');
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('1');

    // Check individual precinct rows in the table
    screen.getByText(election.precincts[0].name);
    screen.getByText(election.precincts[1].name);
    expect(
      screen.queryByText(/Precinct Not Specified/)
    ).not.toBeInTheDocument();

    // Expect test mode callout
    screen.getByText('Test Ballot Mode');

    // Expect one precinct to have a "View Tally Report" button
    expect(screen.queryAllByText('View Tally Report')).toHaveLength(1);
  });

  test('shows poll status summary correctly when there is "all precinct" data - live mode', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Create mock data with aggregated "all precincts" reports
    const mockPollsStatusWithAggregatedData: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPrecinct: {
        // All individual precincts have closed polls
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_open',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
          {
            machineId: 'VxScan-002',
            pollsState: 'polls_open',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[1].id
            ),
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [election.precincts[1].id]: [],
        [election.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsState: 'polls_closed_final',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[2].id
            ),
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
          {
            machineId: 'VxScan-005',
            pollsState: 'polls_closed_final',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[2].id
            ),
            signedTimestamp: new Date('2024-01-01T18:11:00Z'),
          },
        ],
        [ALL_PRECINCTS_REPORT_KEY]: [
          {
            machineId: 'VxScan-004',
            pollsState: 'polls_closed_final',
            precinctSelection: ALL_PRECINCTS_SELECTION,
            signedTimestamp: new Date('2024-01-01T17:45:00Z'),
          },

          {
            machineId: 'VxScan-006',
            pollsState: 'polls_open',
            precinctSelection: ALL_PRECINCTS_SELECTION,
            signedTimestamp: new Date('2024-01-01T17:48:00Z'),
          },
        ],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithAggregatedData));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should not show Test Mode callout since isLive is true
    expect(screen.queryByText(/Test Mode/)).not.toBeInTheDocument();

    // Check that "View Full Election Tally Report" button is enabled
    const viewFullReportButton = screen.getByRole('button', {
      name: 'View Full Election Tally Report',
    });
    expect(viewFullReportButton).toBeEnabled();

    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-closing-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('1');

    // Check individual precinct rows in the table
    screen.getByText(election.precincts[0].name);
    screen.getByText(election.precincts[1].name);
    screen.getByText('Precinct Not Specified');

    // Expect no test mode callout
    expect(screen.queryByText(/Test Ballot Mode/)).not.toBeInTheDocument();
    // The "No Precinct Specified" row does not expose a tally report so there should be one
    // precinct specific "View Tally Report" available.
    expect(screen.queryAllByText('View Tally Report')).toHaveLength(1);

    // Check last report sent column
    await screen.findByText('VxScan-002: Polls Open');
    expect(
      screen.queryByText('VxScan-001: Polls Open')
    ).not.toBeInTheDocument();
    await screen.findByText('VxScan-006: Polls Open');
    await screen.findByText('VxScan-005: Polls Closed');
    expect(
      screen.queryByText('VxScan-003: Polls Closed')
    ).not.toBeInTheDocument();
  });
});

describe('Animation behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('highlights precincts when data changes', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const initialData: Record<string, QuickReportedPollStatus[]> = {
      ...mockPollsStatus.reportsByPrecinct,
    };
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsState: 'polls_open',
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
        signedTimestamp: new Date('2024-01-01T17:00:00Z'),
      },
    ];
    // Start with some initial data - one precinct has a report
    const initialPollsStatus: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPrecinct: initialData,
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(initialPollsStatus));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should show initial counts - 2 precincts with no reports, 1 with polls open
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('2');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');

    for (const precinct of election.precincts) {
      const row = screen.getByTestId(`precinct-row-${precinct.id}`);
      expect(row).toHaveAttribute('data-highlighted', 'false');
    }

    const updatedData: Record<string, QuickReportedPollStatus[]> = {
      ...initialData,
      [election.precincts[1].id]: [
        {
          machineId: 'VxScan-002',
          pollsState: 'polls_open',
          precinctSelection: singlePrecinctSelectionFor(
            election.precincts[1].id
          ),
          signedTimestamp: new Date('2024-01-01T18:00:00Z'),
        },
      ],
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          ...initialPollsStatus,
          reportsByPrecinct: updatedData,
        })
      );

    vi.advanceTimersByTime(VXQR_REFETCH_INTERVAL_MS);
    await waitFor(() => {
      expect(screen.getByTestId('polls-open-count')).toHaveTextContent('2');
    });

    // Check that Precinct 2 is updated and highlighted
    await waitFor(() => {
      const precinct2Row = screen.getByTestId(
        `precinct-row-${election.precincts[1].id}`
      );
      expect(precinct2Row).toHaveAttribute('data-highlighted', 'true');
    });
  });

  test('handles switching between live and test mode', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const initialData = mockPollsStatus.reportsByPrecinct;
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsState: 'polls_closed_final' as const,
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];

    // Start in test mode with some data
    const testModeData: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPrecinct: initialData,
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(testModeData));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should show test mode callout
    await screen.findByText('Test Ballot Mode');

    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsState: 'polls_open' as const,
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];

    // Switch to live mode with same data
    const liveModeData: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      ...testModeData,
      reportsByPrecinct: initialData,
      isLive: true,
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(liveModeData));

    // Wait for update
    vi.advanceTimersByTime(VXQR_REFETCH_INTERVAL_MS);
    await waitFor(() => {
      expect(screen.queryByText('Test Ballot Mode')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');

    // Check animation state with waitFor to handle async updates
    await waitFor(() => {
      const precinct0Row = screen.getByTestId(
        `precinct-row-${election.precincts[0].id}`
      );
      const precinct1Row = screen.getByTestId(
        `precinct-row-${election.precincts[1].id}`
      );

      // Test that the animation behavior is working by verifying the data changes are reflected
      // rather than testing computed CSS (which doesn't work reliably in test environments)
      expect(precinct0Row).toHaveAttribute('data-highlighted', 'true');
      expect(precinct1Row).toHaveAttribute('data-highlighted', 'false');
    });
  });

  test('shows animation when machine status changes for same precinct', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const initialData = mockPollsStatus.reportsByPrecinct;
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsState: 'polls_open' as const,
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
        signedTimestamp: new Date('2024-01-01T17:00:00Z'),
      },
    ];
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election,
          isLive: false,
          ballotHash: 'abc123def456',
          reportsByPrecinct: initialData,
        })
      );

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should show polls open
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    await screen.findByText('VxScan-001: Polls Open');
    const precinctRow = screen.getByTestId(
      `precinct-row-${election.precincts[0].id}`
    );
    expect(precinctRow).toHaveAttribute('data-highlighted', 'false');

    // Update to polls closed
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsState: 'polls_closed_final' as const,
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
        signedTimestamp: new Date('2024-01-01T18:00:00Z'), // Later timestamp
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election,
          ballotHash: 'abc123def456',
          isLive: true,
          reportsByPrecinct: initialData,
        })
      );
    vi.advanceTimersByTime(VXQR_REFETCH_INTERVAL_MS);

    // Wait for the update to be reflected
    await waitFor(() => {
      expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('1');
    });

    // Check highlighted state with waitFor to handle async updates
    await waitFor(() => {
      const precinctRowUpdated = screen.getByTestId(
        `precinct-row-${election.precincts[0].id}`
      );
      expect(precinctRowUpdated).toHaveAttribute('data-highlighted', 'true');
    });

    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('0');
    await screen.findByText('VxScan-001: Polls Closed');
  });

  test('handles precinct not specified data correctly', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const initialData = mockPollsStatus.reportsByPrecinct;
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsState: 'polls_open',
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election,
          ballotHash: 'abc123def456',
          isLive: true,
          reportsByPrecinct: initialData,
        })
      );

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should show the "Precinct Not Specified" row since it has data
    expect(
      screen.queryByText('Precinct Not Specified')
    ).not.toBeInTheDocument();

    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    expect(
      screen.queryByText('Precinct Not Specified')
    ).not.toBeInTheDocument();

    // Add precinct not specified data
    const updatedData: Record<string, QuickReportedPollStatus[]> = {
      ...initialData,
      [ALL_PRECINCTS_REPORT_KEY]: [
        {
          machineId: 'VxScan-999',
          pollsState: 'polls_open',
          precinctSelection: singlePrecinctSelectionFor(
            election.precincts[0].id
          ),
          signedTimestamp: new Date('2024-01-01T19:00:00Z'),
        },
      ],
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election,
          ballotHash: 'abc123def456',
          isLive: true,
          reportsByPrecinct: updatedData,
        })
      );
    vi.advanceTimersByTime(VXQR_REFETCH_INTERVAL_MS);

    await waitFor(() => {
      expect(screen.getByTestId('polls-open-count')).toHaveTextContent('2');
    });
    await screen.findByText('Precinct Not Specified');

    // Check highlighted state with waitFor to handle async updates
    await waitFor(() => {
      const nonSpecifiedRow = screen.getByTestId('precinct-row-');
      expect(nonSpecifiedRow).toHaveAttribute('data-highlighted', 'true');
    });
  });
});

describe('Results navigation and display', () => {
  test('can view results properly for a single precinct general election', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Set up polls status data with closed polls for first precinct
    const mockPollsStatusWithClosedPolls: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPrecinct: {
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_closed_final',
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [election.precincts[1].id]: [],
        [election.precincts[2].id]: [],
        [ALL_PRECINCTS_REPORT_KEY]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithClosedPolls));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Check that the "View Tally Report" button is present and enabled for closed polls
    const viewTallyReportButton = screen.getByRole('button', {
      name: 'View Tally Report',
    });
    expect(viewTallyReportButton).toBeEnabled();

    // Mock the API call that will be made when navigating to results view
    const mockSinglePrecinctResults = createMockAggregatedResults(
      election,
      false
    );
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
      })
      .resolves(ok(mockSinglePrecinctResults));

    // Click the view tally report button - this should trigger navigation and API call
    userEvent.click(viewTallyReportButton);

    // Wait for the API call to be made, confirming navigation attempt worked
    await screen.findAllByText(
      'Unofficial Test Center Springfield Tally Report'
    );

    // In a general election we do not show Nonpartisan Contests as a header
    expect(screen.queryByText('Nonpartisan Contests')).not.toBeInTheDocument();
    for (const contest of election.contests) {
      screen.getByText(contest.title);
    }
  });

  test('can view results properly for all precincts general election', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Set up polls status data with all polls closed
    const mockPollsStatusAllClosed: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPrecinct: {
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [election.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[1].id
            ),
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [election.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[2].id
            ),
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
        ],

        [ALL_PRECINCTS_REPORT_KEY]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusAllClosed));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Check that the "View Full Election Tally Report" button is present and enabled
    const viewFullReportButton = screen.getByRole('button', {
      name: 'View Full Election Tally Report',
    });
    expect(viewFullReportButton).toBeEnabled();

    // Mock the API call that will be made when navigating to results view
    const mockAllPrecinctsResults = createMockAggregatedResults(election, true);
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(mockAllPrecinctsResults));

    // Click the view full election tally report button - this should trigger navigation and API call
    userEvent.click(viewFullReportButton);

    // Wait for the API call to be made, confirming navigation attempt worked
    await screen.findAllByText('Unofficial Tally Report');

    // In a general election we do not show Nonpartisan Contests as a header
    expect(screen.queryByText('Nonpartisan Contests')).not.toBeInTheDocument();
    for (const contest of election.contests) {
      screen.getByText(contest.title);
    }
  });

  test('can view results properly for all precincts primary election', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId: primaryElection.id })
      .resolves(mockSystemSettingsWithUrl);

    // Set up polls status data with all polls closed
    const mockPollsStatusAllClosed: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: primaryElection,
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPrecinct: {
        [primaryElection.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              primaryElection.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [primaryElection.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              primaryElection.precincts[1].id
            ),
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [primaryElection.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              primaryElection.precincts[2].id
            ),
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
        ],
        [ALL_PRECINCTS_REPORT_KEY]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId: primaryElection.id })
      .resolves(ok(mockPollsStatusAllClosed));

    renderScreen(primaryElection.id);

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Check that the "View Full Election Tally Report" button is present and enabled
    const viewFullReportButton = screen.getByRole('button', {
      name: 'View Full Election Tally Report',
    });
    expect(viewFullReportButton).toBeEnabled();

    // Mock the API call that will be made when navigating to results view
    const mockAllPrecinctsResults = createMockAggregatedResults(
      primaryElection,
      true
    );
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId: primaryElection.id,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(mockAllPrecinctsResults));

    // Click the view full election tally report button - this should trigger navigation and API call
    userEvent.click(viewFullReportButton);

    // Wait for the API call to be made, confirming navigation attempt worked
    await screen.findAllByText('Unofficial Tally Report');

    // In a general election we do not show Nonpartisan Contests as a header
    await screen.findByText('Nonpartisan Contests');
    await screen.findByText('Mammal Party Contests');
    await screen.findByText('Fish Party Contests');

    // All contests should be shown
    for (const contest of primaryElection.contests) {
      screen.getByText(contest.title);
    }
  });

  test('can view results properly for single precinct primary election', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId: primaryElection.id })
      .resolves(mockSystemSettingsWithUrl);

    // Set up polls status data with all polls closed
    const mockPollsStatusAllClosed: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: primaryElection,
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPrecinct: {
        [primaryElection.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              primaryElection.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [primaryElection.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              primaryElection.precincts[1].id
            ),
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [primaryElection.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              primaryElection.precincts[2].id
            ),
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
        ],
        [ALL_PRECINCTS_REPORT_KEY]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId: primaryElection.id })
      .resolves(ok(mockPollsStatusAllClosed));

    renderScreen(primaryElection.id);

    await screen.findByRole('heading', { name: 'Live Reports' });

    // There should be three "View Tally Report" buttons - one for each precinct with results
    expect(
      screen.getAllByRole('button', {
        name: 'View Tally Report',
      })
    ).toHaveLength(3);

    const precinct0TallyButton = screen.getByTestId(
      `view-tally-report-${primaryElection.precincts[0].id}`
    );
    expect(precinct0TallyButton).toBeEnabled();

    // Mock the API call that will be made when navigating to results view
    const mockPrecinct0Results = createMockAggregatedResults(
      primaryElection,
      true
    );
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId: primaryElection.id,
        precinctSelection: singlePrecinctSelectionFor(
          primaryElection.precincts[0].id
        ),
      })
      .resolves(ok(mockPrecinct0Results));

    // Click the view full election tally report button - this should trigger navigation and API call
    userEvent.click(precinct0TallyButton);

    // Wait for the API call to be made, confirming navigation attempt worked
    await screen.findAllByText('Unofficial Precinct 1 Tally Report');

    // In a general election we do not show Nonpartisan Contests as a header
    await screen.findByText('Nonpartisan Contests');
    await screen.findByText('Mammal Party Contests');
    await screen.findByText('Fish Party Contests');

    const contestsInPrecinct = getContestsForPrecinctAndElection(
      primaryElection,
      singlePrecinctSelectionFor(primaryElection.precincts[0].id)
    );
    const contestsOutsidePrecinct = election.contests.filter(
      (c) => !contestsInPrecinct.some((cp) => cp.id === c.id)
    );
    // Contests in the precinct should have results listed.
    for (const contest of contestsInPrecinct) {
      await screen.findByText(contest.title);
    }
    for (const contest of contestsOutsidePrecinct) {
      expect(screen.queryByText(contest.title)).not.toBeInTheDocument();
    }
  });

  test('can delete data properly', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const mockPollsStatusWithData: {
      election: typeof election;
      ballotHash: string;
      isLive: boolean;
      reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
    } = {
      election,
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPrecinct: {
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsState: 'polls_closed_final' as const,
            precinctSelection: singlePrecinctSelectionFor(
              election.precincts[0].id
            ),
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [election.precincts[1].id]: [],
        [election.precincts[2].id]: [],
        [ALL_PRECINCTS_REPORT_KEY]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithData));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Verify the delete button is present and properly labeled
    const deleteButton = screen.getByRole('button', {
      name: 'Delete All Reports',
    });
    expect(deleteButton).toBeEnabled();

    // Click the delete button to open the modal
    userEvent.click(deleteButton);

    // Should see the confirmation modal
    await screen.findByRole('heading', { name: 'Delete All Reports' });
    await screen.findByText(
      'Are you sure you want to delete all reports for this election?'
    );

    const closeButton = screen.getByRole('button', { name: /cancel/i });
    userEvent.click(closeButton);

    // Modal should close after clicking cancel
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Delete All Reports' })
      ).not.toBeInTheDocument();
    });

    // Reopen the modal
    userEvent.click(deleteButton);

    await screen.findByRole('heading', { name: 'Delete All Reports' });

    // Mock the delete mutation after the modal is open
    apiMock.deleteQuickReportingResults
      .expectCallWith({ electionId })
      .resolves();

    // Click the confirm delete button
    const confirmDeleteButton = screen.getByTestId(
      'confirm-delete-data-button'
    );
    userEvent.click(confirmDeleteButton);

    // Modal should close after the deletion
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Delete Reports' })
      ).not.toBeInTheDocument();
    });
  });
});
