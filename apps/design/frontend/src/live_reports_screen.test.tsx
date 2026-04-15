import { afterEach, beforeEach, describe, expect, vi, test } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { cleanup, screen, waitFor } from '@testing-library/react';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  ElectionId,
  Election,
  PollingPlace,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  type ContestResultsSummaries,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import type { QuickReportedPollStatus } from '@votingworks/design-backend';
import { err, ok } from '@votingworks/basics';
import { render } from '../test/react_testing_library';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
  mockStateFeatures,
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
  mockStateFeatures(apiMock, electionId);
});

afterEach(() => {
  apiMock.assertComplete();
  cleanup();
});

function renderScreen(
  electionIdParam?: ElectionId,
  initialPath?: string
): ReturnType<typeof createMemoryHistory> {
  const resolvedElectionId = electionIdParam ?? electionId;
  apiMock.getElectionInfo
    .expectCallWith({ electionId: resolvedElectionId })
    .resolves(electionInfoFromRecord(electionRecord));
  const { path } = routes.election(resolvedElectionId).reports.root;
  const paramPath = routes.election(':electionId').reports.root.path;
  const startingPath = initialPath ?? path;
  const history = createMemoryHistory({ initialEntries: [startingPath] });
  render(
    provideApi(
      apiMock,
      withRoute(<LiveReportsScreen />, {
        paramPath,
        path: startingPath,
        history,
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
      bmd: [],
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

// Generate an election with polling places from precincts (one per precinct)
function electionWithPollingPlaces(electionItem: Election): Election {
  return {
    ...electionItem,
    pollingPlaces: electionItem.precincts.map((precinct) => ({
      id: precinct.id,
      name: precinct.name,
      type: 'election_day' as const,
      precincts: { [precinct.id]: { type: 'whole' as const } },
    })),
  };
}

/**
 * Generate an election with all three voting group types:
 * - Election day: one polling place per precinct (1:1)
 * - Early voting: one polling place covering ALL precincts
 * - Absentee: one polling place covering ALL precincts
 */
function electionWithAllVotingGroups(electionItem: Election): Election {
  const electionDayPlaces = electionItem.precincts.map((precinct) => ({
    id: `ed-${precinct.id}`,
    name: `${precinct.name} Polling Place`,
    type: 'election_day' as const,
    precincts: {
      [precinct.id]: { type: 'whole' as const },
    },
  }));

  const allPrecincts = Object.fromEntries(
    electionItem.precincts.map((p) => [p.id, { type: 'whole' as const }])
  );

  const earlyVotingPlace: PollingPlace = {
    id: 'ev-city-hall',
    name: 'City Hall Early Voting',
    type: 'early_voting',
    precincts: allPrecincts,
  };

  const absenteeSite: PollingPlace = {
    id: 'abs-county-clerk',
    name: 'County Clerk Absentee',
    type: 'absentee',
    precincts: allPrecincts,
  };

  return {
    ...electionItem,
    pollingPlaces: [...electionDayPlaces, earlyVotingPlace, absenteeSite],
  };
}

// Helper function to create mock polls status data
function createMockPollsStatus(electionItem: Election, isLive = false) {
  const electionWithPlaces = electionWithPollingPlaces(electionItem);
  const reportsByPollingPlace: Record<string, QuickReportedPollStatus[]> = {};

  for (const place of electionWithPlaces.pollingPlaces ?? []) {
    reportsByPollingPlace[place.id] = [];
  }

  return {
    election: electionWithPlaces,
    ballotHash: 'abc123def456',
    isLive,
    reportsByPollingPlace,
  };
}

function createMockActivityLog(entries: QuickReportedPollStatus[] = []): {
  activityLog: QuickReportedPollStatus[];
} {
  return { activityLog: entries };
}

function createMockPollsStatusAllGroups(
  electionItem: Election,
  isLive = false
) {
  const electionWithPlaces = electionWithAllVotingGroups(electionItem);
  const reportsByPollingPlace: Record<string, QuickReportedPollStatus[]> = {};

  for (const place of electionWithPlaces.pollingPlaces ?? []) {
    reportsByPollingPlace[place.id] = [];
  }

  return {
    election: electionWithPlaces,
    ballotHash: 'abc123def456',
    isLive,
    reportsByPollingPlace,
  };
}

const mockPollsStatus = createMockPollsStatus(election);
const emptyActivityLog = createMockActivityLog();

/**
 * Set up the default mock for `getLiveReportsActivityLog` to return an empty
 * activity log for all `votingGroup` calls. Tests that need specific entries
 * can override with a fresh `expectRepeatedCallsWith` after this.
 */
function mockEmptyActivityLogForAllTabs(electionIdOverride: ElectionId) {
  apiMock.getLiveReportsActivityLog
    .expectRepeatedCallsWith({ electionId: electionIdOverride })
    .resolves(ok(emptyActivityLog));
}

describe('Navigation tab visibility', () => {
  test('Results tab appears in navigation when quickResultsReportingUrl is configured', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

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
    expect(screen.queryByRole('button', { name: 'Live Reports' })).toBeNull();
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
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(election),
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPollingPlace: {
        // First precinct has reports (polls closed)
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'close_polls',
            pollingPlaceId: election.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        // Second precinct has reports (polls open)
        [election.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsTransitionType: 'open_polls',
            pollingPlaceId: election.precincts[1].id,
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
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Check that "View Tally Reports" button is present
    screen.getByRole('button', { name: 'View Tally Reports' });

    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-paused-count')).toHaveTextContent('0');
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('1');

    expect(screen.queryByText(/Precinct Not Specified/)).toBeNull();

    // Expect test mode callout
    screen.getByText('Test Ballot Mode');
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
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(election),
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPollingPlace: {
        // All individual precincts have closed polls
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'open_polls',
            pollingPlaceId: election.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
          {
            machineId: 'VxScan-002',
            pollsTransitionType: 'open_polls',
            pollingPlaceId: election.precincts[1].id,
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [election.precincts[1].id]: [],
        [election.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsTransitionType: 'close_polls',
            pollingPlaceId: election.precincts[2].id,
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
          {
            machineId: 'VxScan-005',
            pollsTransitionType: 'close_polls',
            pollingPlaceId: election.precincts[2].id,
            signedTimestamp: new Date('2024-01-01T18:11:00Z'),
          },
        ],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithAggregatedData));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should not show Test Mode callout since isLive is true
    expect(screen.queryByText(/Test Mode/)).toBeNull();

    // Check that "View Tally Reports" button is present
    screen.getByRole('button', { name: 'View Tally Reports' });

    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    expect(screen.getByTestId('polls-paused-count')).toHaveTextContent('0');
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('1');

    expect(screen.queryByText('Precinct Not Specified')).toBeNull();

    // Expect no test mode callout
    expect(screen.queryByText(/Test Ballot Mode/)).toBeNull();
  });
});

describe('Voting group cards', () => {
  test('shows tabs and overview cards for each voting group', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatusAllGroups(election, true);
    // Need at least one report so the UI renders
    pollsStatus.reportsByPollingPlace[`ed-${election.precincts[0].id}`] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: `ed-${election.precincts[0].id}`,
        signedTimestamp: new Date('2024-01-01T07:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // All four tabs should be visible
    screen.getByRole('tab', { name: 'All Voting Groups' });
    screen.getByRole('tab', { name: 'Early Voting' });
    screen.getByRole('tab', { name: 'Election Day' });
    screen.getByRole('tab', { name: 'Absentee Voting' });

    // Overview cards still exist (one per voting group with polling places)
    screen.getByTestId('overview-card-early_voting');
    screen.getByTestId('overview-card-election_day');
    screen.getByTestId('overview-card-absentee');
  });

  test('shows only cards for groups with polling places', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // election-day-only polling places (from electionWithPollingPlaces)
    const pollsStatus = createMockPollsStatus(election, true);
    pollsStatus.reportsByPollingPlace[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T17:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Only the election_day card should be present
    await screen.findByTestId('overview-card-election_day');
    expect(screen.queryByTestId('overview-card-early_voting')).toBeNull();
    expect(screen.queryByTestId('overview-card-absentee')).toBeNull();

    // Tab bar should not render at all (only one voting group has polling places)
    expect(screen.queryByRole('tab', { name: 'All Voting Groups' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Election Day' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Early Voting' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Absentee Voting' })).toBeNull();
  });

  test('Election Day tab navigates to election day group page', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatusAllGroups(election, true);
    // Mark some election day places as open
    pollsStatus.reportsByPollingPlace[`ed-${election.precincts[0].id}`] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: `ed-${election.precincts[0].id}`,
        signedTimestamp: new Date('2024-01-01T07:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(emptyActivityLog));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'election_day' })
      .resolves(ok(emptyActivityLog));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Click Election Day tab
    userEvent.click(screen.getByRole('tab', { name: 'Election Day' }));

    // Should see election day polling places (wait for query to update)
    await screen.findByText(`${election.precincts[0].name} Polling Place`);
    screen.getByText(`${election.precincts[1].name} Polling Place`);

    // Should NOT see early voting or absentee places in the table
    expect(screen.queryByTestId('polling-place-row-ev-city-hall')).toBeNull();
    expect(
      screen.queryByTestId('polling-place-row-abs-county-clerk')
    ).toBeNull();

    // Summary should count only election day places
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('2');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');

    // Polls open and polls paused should be visible (non-absentee group)
    screen.getByTestId('polls-open-count');
    screen.getByTestId('polls-paused-count');
  });

  test('Early Voting tab navigates to early voting group page', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatusAllGroups(election, true);
    // Mark early voting place as paused
    pollsStatus.reportsByPollingPlace['ev-city-hall'] = [
      {
        machineId: 'VxScan-010',
        pollsTransitionType: 'pause_voting',
        pollingPlaceId: 'ev-city-hall',
        signedTimestamp: new Date('2024-01-01T16:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(emptyActivityLog));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'early_voting' })
      .resolves(ok(emptyActivityLog));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Click Early Voting tab
    userEvent.click(screen.getByRole('tab', { name: 'Early Voting' }));

    // Should see only the early voting polling place (wait for query to update)
    await screen.findByText('City Hall Early Voting');

    // Should NOT see election day or absentee places in the table
    expect(
      screen.queryByTestId(`polling-place-row-ed-${election.precincts[0].id}`)
    ).toBeNull();
    expect(
      screen.queryByTestId('polling-place-row-abs-county-clerk')
    ).toBeNull();

    // Summary counts for early voting only
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('0');
    expect(screen.getByTestId('polls-paused-count')).toHaveTextContent('1');
  });

  test('Absentee group page hides polls open and polls paused stats', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatusAllGroups(election, true);
    // Absentee place has voting complete
    pollsStatus.reportsByPollingPlace['abs-county-clerk'] = [
      {
        machineId: 'VxAdmin-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: 'abs-county-clerk',
        signedTimestamp: new Date('2024-01-01T20:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(emptyActivityLog));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'absentee' })
      .resolves(ok(emptyActivityLog));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Click Absentee tab
    userEvent.click(screen.getByRole('tab', { name: 'Absentee Voting' }));

    // Should see only the absentee polling place (wait for query to update)
    await screen.findByText('County Clerk Absentee');

    // Should NOT see election day or early voting places in the table
    expect(
      screen.queryByTestId(`polling-place-row-ed-${election.precincts[0].id}`)
    ).toBeNull();
    expect(screen.queryByTestId('polling-place-row-ev-city-hall')).toBeNull();

    // Polls open and polls paused should NOT be visible
    expect(screen.queryByTestId('polls-open-count')).toBeNull();
    expect(screen.queryByTestId('polls-paused-count')).toBeNull();

    // No reports sent and voting complete should still be visible
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('0');
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('1');
  });

  test('Overview shows summary cards for all voting group types', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatusAllGroups(election, true);
    // Set different statuses across types
    pollsStatus.reportsByPollingPlace[`ed-${election.precincts[0].id}`] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: `ed-${election.precincts[0].id}`,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];
    pollsStatus.reportsByPollingPlace['ev-city-hall'] = [
      {
        machineId: 'VxScan-010',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: 'ev-city-hall',
        signedTimestamp: new Date('2024-01-01T07:00:00Z'),
      },
    ];
    pollsStatus.reportsByPollingPlace['abs-county-clerk'] = [
      {
        machineId: 'VxAdmin-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: 'abs-county-clerk',
        signedTimestamp: new Date('2024-01-01T20:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // All three cards should be visible
    screen.getByTestId('overview-card-early_voting');
    screen.getByTestId('overview-card-election_day');
    screen.getByTestId('overview-card-absentee');

    // Overview renders summary stats per card. Cards are rendered in
    // VOTING_GROUPS order: early_voting (0), election_day (1), absentee (2).
    const noReportsCounts = screen.getAllByTestId('no-reports-sent-count');
    expect(noReportsCounts).toHaveLength(3);
    // early_voting: 0 no reports (1 place, 1 open)
    expect(noReportsCounts[0]).toHaveTextContent('0');
    // election_day: 2 no reports (3 places, 1 closed)
    expect(noReportsCounts[1]).toHaveTextContent('2');
    // absentee: 0 no reports (1 place, 1 closed)
    expect(noReportsCounts[2]).toHaveTextContent('0');

    const pollsClosedCounts = screen.getAllByTestId('polls-closed-count');
    expect(pollsClosedCounts).toHaveLength(3);
    expect(pollsClosedCounts[0]).toHaveTextContent('0'); // early_voting
    expect(pollsClosedCounts[1]).toHaveTextContent('1'); // election_day
    expect(pollsClosedCounts[2]).toHaveTextContent('1'); // absentee

    // polls-open-count is hidden for absentee, so only 2 instances
    const pollsOpenCounts = screen.getAllByTestId('polls-open-count');
    expect(pollsOpenCounts).toHaveLength(2);
    expect(pollsOpenCounts[0]).toHaveTextContent('1'); // early_voting
    expect(pollsOpenCounts[1]).toHaveTextContent('0'); // election_day

    // polls-paused-count is also hidden for absentee
    expect(screen.getAllByTestId('polls-paused-count')).toHaveLength(2);
  });

  test('navigating between groups updates summary counts correctly', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatusAllGroups(election, true);
    // All election day places closed
    for (const precinct of election.precincts) {
      pollsStatus.reportsByPollingPlace[`ed-${precinct.id}`] = [
        {
          machineId: `VxScan-${precinct.id}`,
          pollsTransitionType: 'close_polls',
          pollingPlaceId: `ed-${precinct.id}`,
          signedTimestamp: new Date('2024-01-01T18:00:00Z'),
        },
      ];
    }
    // Early voting open
    pollsStatus.reportsByPollingPlace['ev-city-hall'] = [
      {
        machineId: 'VxScan-010',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: 'ev-city-hall',
        signedTimestamp: new Date('2024-01-01T07:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(emptyActivityLog));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'election_day' })
      .resolves(ok(emptyActivityLog));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(emptyActivityLog));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'absentee' })
      .resolves(ok(emptyActivityLog));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Navigate to Election Day group
    userEvent.click(screen.getByRole('tab', { name: 'Election Day' }));
    await waitFor(() => {
      expect(screen.getByTestId('polls-open-count')).toHaveTextContent('0');
    });
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('3');
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('0');

    // Click "All Voting Groups" tab to go back to overview
    userEvent.click(screen.getByRole('tab', { name: 'All Voting Groups' }));
    await waitFor(() => {
      expect(screen.queryByTestId('overview-card-absentee')).not.toBeNull();
    });

    // Navigate to Absentee
    userEvent.click(screen.getByRole('tab', { name: 'Absentee Voting' }));
    await waitFor(() => {
      expect(screen.queryByTestId('polls-open-count')).toBeNull();
    });
    expect(screen.getByTestId('polls-closed-count')).toHaveTextContent('0');
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('1');
  });

  test('activity log on group page is filtered to that group', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const edActivityEntry: QuickReportedPollStatus = {
      machineId: 'VxScan-001',
      pollsTransitionType: 'close_polls',
      pollingPlaceId: `ed-${election.precincts[0].id}`,
      signedTimestamp: new Date('2024-01-01T18:00:00Z'),
    };
    const absActivityEntry: QuickReportedPollStatus = {
      machineId: 'VxAdmin-001',
      pollsTransitionType: 'close_polls',
      pollingPlaceId: 'abs-county-clerk',
      signedTimestamp: new Date('2024-01-01T20:00:00Z'),
    };

    const pollsStatusAll = createMockPollsStatusAllGroups(election, true);
    pollsStatusAll.reportsByPollingPlace[`ed-${election.precincts[0].id}`] = [
      edActivityEntry,
    ];
    pollsStatusAll.reportsByPollingPlace['abs-county-clerk'] = [
      absActivityEntry,
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatusAll));
    // Overview shows all entries; per-group pages get filtered entries.
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(createMockActivityLog([absActivityEntry, edActivityEntry])));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'election_day' })
      .resolves(ok(createMockActivityLog([edActivityEntry])));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(createMockActivityLog([absActivityEntry, edActivityEntry])));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'absentee' })
      .resolves(ok(createMockActivityLog([absActivityEntry])));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Overview shows entries from all groups
    await screen.findByText(/VxAdmin-001: Polls Closed/);
    screen.getByText(/VxScan-001: Polls Closed/);

    // Navigate to Election Day group — only election day entries
    userEvent.click(screen.getByRole('tab', { name: 'Election Day' }));
    await waitFor(() => {
      expect(screen.queryByText(/VxAdmin-001: Polls Closed/)).toBeNull();
    });
    screen.getByText(/VxScan-001: Polls Closed/);

    // Click "All Voting Groups" tab to go back to overview
    userEvent.click(screen.getByRole('tab', { name: 'All Voting Groups' }));
    await waitFor(() => {
      expect(screen.queryByTestId('overview-card-absentee')).not.toBeNull();
    });

    // Navigate to Absentee — only absentee entries
    userEvent.click(screen.getByRole('tab', { name: 'Absentee Voting' }));
    await waitFor(() => {
      expect(screen.queryByText(/VxScan-001: Polls Closed/)).toBeNull();
    });
    screen.getByText(/VxAdmin-001: Polls Closed/);
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
      ...mockPollsStatus.reportsByPollingPlace,
    };
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T17:00:00Z'),
      },
    ];
    // Start with some initial data - one precinct has a report
    const electionWithPlaces = electionWithPollingPlaces(election);
    const initialPollsStatus: {
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPlaces,
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPollingPlace: initialData,
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(initialPollsStatus));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'election_day' })
      .resolves(ok(emptyActivityLog));

    // Render directly at the Election Day group page (where rows are rendered)
    renderScreen(
      electionId,
      routes.election(electionId).reports.votingGroup('election_day').path
    );

    await screen.findByRole('heading', { name: 'Live Reports' });
    await screen.findByText(election.precincts[0].name);

    // Should show initial counts - 2 precincts with no reports, 1 with polls open
    expect(screen.getByTestId('no-reports-sent-count')).toHaveTextContent('2');
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');

    for (const precinct of election.precincts) {
      const row = screen.getByTestId(`polling-place-row-${precinct.id}`);
      expect(row).toHaveAttribute('data-highlighted', 'false');
    }

    const updatedData: Record<string, QuickReportedPollStatus[]> = {
      ...initialData,
      [election.precincts[1].id]: [
        {
          machineId: 'VxScan-002',
          pollsTransitionType: 'open_polls',
          pollingPlaceId: election.precincts[1].id,
          signedTimestamp: new Date('2024-01-01T18:00:00Z'),
        },
      ],
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          ...initialPollsStatus,
          reportsByPollingPlace: updatedData,
        })
      );

    vi.advanceTimersByTime(VXQR_REFETCH_INTERVAL_MS);
    await waitFor(() => {
      expect(screen.getByTestId('polls-open-count')).toHaveTextContent('2');
    });

    // Check that Precinct 2 is updated and highlighted
    await waitFor(() => {
      const precinct2Row = screen.getByTestId(
        `polling-place-row-${election.precincts[1].id}`
      );
      expect(precinct2Row).toHaveAttribute('data-highlighted', 'true');
    });
  });

  test('handles switching between live and test mode', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const initialData = mockPollsStatus.reportsByPollingPlace;
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls' as const,
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];

    // Start in test mode with some data
    const testModeData: {
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(election),
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPollingPlace: initialData,
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(testModeData));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'election_day' })
      .resolves(ok(emptyActivityLog));

    // Render directly at the Election Day group page (where rows are rendered)
    renderScreen(
      electionId,
      routes.election(electionId).reports.votingGroup('election_day').path
    );

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Should show test mode callout
    await screen.findByText('Test Ballot Mode');
    await screen.findByText(election.precincts[0].name);

    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'open_polls' as const,
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];

    // Switch to live mode with same data
    const liveModeData: {
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      ...testModeData,
      reportsByPollingPlace: initialData,
      isLive: true,
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(liveModeData));

    // Wait for update
    vi.advanceTimersByTime(VXQR_REFETCH_INTERVAL_MS);
    await waitFor(() => {
      expect(screen.queryByText('Test Ballot Mode')).toBeNull();
    });

    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');

    // Check animation state with waitFor to handle async updates
    await waitFor(() => {
      const precinct0Row = screen.getByTestId(
        `polling-place-row-${election.precincts[0].id}`
      );
      const precinct1Row = screen.getByTestId(
        `polling-place-row-${election.precincts[1].id}`
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

    const initialData = mockPollsStatus.reportsByPollingPlace;
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'open_polls' as const,
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T17:00:00Z'),
      },
    ];
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election: electionWithPollingPlaces(election),
          isLive: false,
          ballotHash: 'abc123def456',
          reportsByPollingPlace: initialData,
        })
      );
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId, votingGroup: 'election_day' })
      .resolves(ok(emptyActivityLog));

    // Render directly at the Election Day group page (where rows are rendered)
    renderScreen(
      electionId,
      routes.election(electionId).reports.votingGroup('election_day').path
    );

    await screen.findByRole('heading', { name: 'Live Reports' });
    await screen.findByText(election.precincts[0].name);

    // Should show polls open
    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('1');
    const precinctRow = screen.getByTestId(
      `polling-place-row-${election.precincts[0].id}`
    );
    expect(precinctRow).toHaveAttribute('data-highlighted', 'false');

    // Update to polls closed
    initialData[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls' as const,
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'), // Later timestamp
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election: electionWithPollingPlaces(election),
          ballotHash: 'abc123def456',
          isLive: true,
          reportsByPollingPlace: initialData,
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
        `polling-place-row-${election.precincts[0].id}`
      );
      expect(precinctRowUpdated).toHaveAttribute('data-highlighted', 'true');
    });

    expect(screen.getByTestId('polls-open-count')).toHaveTextContent('0');
  });
});

describe('Results navigation and display', () => {
  test('can view results properly for a single precinct general election', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Set up polls status data with closed polls for first precinct
    const mockPollsStatusWithClosedPolls: {
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(election),
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPollingPlace: {
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'close_polls',
            pollingPlaceId: election.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [election.precincts[1].id]: [],
        [election.precincts[2].id]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithClosedPolls));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Mock the API call for all precincts results (initial navigation)
    const mockAllPrecinctsResults = createMockAggregatedResults(
      election,
      false
    );
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(mockAllPrecinctsResults));

    // Click the "View Tally Reports" button
    const viewTallyReportsLink = screen.getByRole('button', {
      name: 'View Tally Reports',
    });
    userEvent.click(viewTallyReportsLink);

    // Wait for the results page to load
    await screen.findAllByText(/Unofficial.*Tally Report/);

    // Now select a single precinct from the dropdown
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

    const precinctSelect = screen.getByRole('combobox', {
      name: 'Select precinct',
    });
    userEvent.click(precinctSelect);
    const option = await screen.findByRole('option', {
      name: election.precincts[0].name,
    });
    userEvent.click(option);

    // At least some contests should be rendered for this precinct
    await waitFor(() => {
      const tables = screen.getAllByRole('table');
      expect(tables.length).toBeGreaterThan(0);
    });
  });

  test('can view results properly for all precincts general election', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Set up polls status data with all polls closed
    const mockPollsStatusAllClosed: {
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(election),
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPollingPlace: {
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: election.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [election.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: election.precincts[1].id,
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [election.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: election.precincts[2].id,
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
        ],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusAllClosed));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    const viewFullReportButton = screen.getByRole('button', {
      name: 'View Tally Reports',
    });

    // Mock the API call that will be made when navigating to results view
    const mockAllPrecinctsResults = createMockAggregatedResults(election, true);
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(mockAllPrecinctsResults));

    // Click the view tally reports link - this should trigger navigation and API call
    userEvent.click(viewFullReportButton);

    // Wait for the API call to be made, confirming navigation attempt worked
    await screen.findAllByText('Unofficial Tally Report');

    // In a general election we do not show Nonpartisan Contests as a header
    expect(screen.queryByText('Nonpartisan Contests')).toBeNull();
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
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(primaryElection),
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPollingPlace: {
        [primaryElection.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: primaryElection.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [primaryElection.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: primaryElection.precincts[1].id,
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [primaryElection.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: primaryElection.precincts[2].id,
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
        ],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId: primaryElection.id })
      .resolves(ok(mockPollsStatusAllClosed));
    mockEmptyActivityLogForAllTabs(primaryElection.id);

    mockStateFeatures(apiMock, primaryElection.id);

    renderScreen(primaryElection.id);

    await screen.findByRole('heading', { name: 'Live Reports' });

    const viewFullReportButton = screen.getByRole('button', {
      name: 'View Tally Reports',
    });

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

    // Click the view tally reports link - this should trigger navigation and API call
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
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(primaryElection),
      ballotHash: 'abc123def456',
      isLive: true,
      reportsByPollingPlace: {
        [primaryElection.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: primaryElection.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [primaryElection.precincts[1].id]: [
          {
            machineId: 'VxScan-002',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: primaryElection.precincts[1].id,
            signedTimestamp: new Date('2024-01-01T18:05:00Z'),
          },
        ],
        [primaryElection.precincts[2].id]: [
          {
            machineId: 'VxScan-003',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: primaryElection.precincts[2].id,
            signedTimestamp: new Date('2024-01-01T18:10:00Z'),
          },
        ],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId: primaryElection.id })
      .resolves(ok(mockPollsStatusAllClosed));
    mockEmptyActivityLogForAllTabs(primaryElection.id);

    mockStateFeatures(apiMock, primaryElection.id);

    renderScreen(primaryElection.id);

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Mock the API call for all precincts results (initial navigation)
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

    // Click the "View Tally Reports" button
    const viewTallyReportsLink = screen.getByRole('button', {
      name: 'View Tally Reports',
    });
    userEvent.click(viewTallyReportsLink);

    // Wait for the results page to load
    await screen.findAllByText('Unofficial Tally Report');

    // Now select a single precinct from the dropdown
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

    const precinctSelect = screen.getByRole('combobox', {
      name: 'Select precinct',
    });
    userEvent.click(precinctSelect);
    const option = await screen.findByRole('option', {
      name: primaryElection.precincts[0].name,
    });
    userEvent.click(option);

    // In a primary election, show party headers
    // At least some contests and party headers should be rendered
    await waitFor(() => {
      const tables = screen.getAllByRole('table');
      expect(tables.length).toBeGreaterThan(0);
    });
  });

  test('can delete data properly', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);
    mockStateFeatures(apiMock, electionId, { DELETE_LIVE_REPORTS: true });

    const mockPollsStatusWithData: {
      election: Election;
      ballotHash: string;
      isLive: boolean;
      reportsByPollingPlace: Record<string, QuickReportedPollStatus[]>;
    } = {
      election: electionWithPollingPlaces(election),
      ballotHash: 'abc123def456',
      isLive: false,
      reportsByPollingPlace: {
        [election.precincts[0].id]: [
          {
            machineId: 'VxScan-001',
            pollsTransitionType: 'close_polls' as const,
            pollingPlaceId: election.precincts[0].id,
            signedTimestamp: new Date('2024-01-01T18:00:00Z'),
          },
        ],
        [election.precincts[1].id]: [],
        [election.precincts[2].id]: [],
      },
    };

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(mockPollsStatusWithData));
    mockEmptyActivityLogForAllTabs(electionId);

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
      ).toBeNull();
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
      ).toBeNull();
    });
  });
});

describe('Edge cases', () => {
  test('shows configuration error when election has no polling places', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    // Election with pollingPlaces explicitly undefined
    const electionWithoutPlaces: Election = {
      ...election,
      pollingPlaces: undefined,
    };
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(
        ok({
          election: electionWithoutPlaces,
          ballotHash: 'abc123def456',
          isLive: false,
          reportsByPollingPlace: {},
        })
      );

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });
    await screen.findByText(/Polling places are required/);
    // Cards and summary should not be rendered
    expect(screen.queryByTestId('overview-card-election_day')).toBeNull();
    expect(screen.queryByTestId('no-reports-sent-count')).toBeNull();
  });

  test('delete button is hidden when DELETE_LIVE_REPORTS state feature is off', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatus(election, true);
    pollsStatus.reportsByPollingPlace[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    // DELETE_LIVE_REPORTS is not enabled (default empty state features)
    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });
    await screen.findByRole('button', { name: 'View Tally Reports' });
    expect(
      screen.queryByRole('button', { name: 'Delete All Reports' })
    ).toBeNull();
  });

  test('activity log displays each polls transition name', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatus(election, true);
    // Put a report in the table so the UI renders
    pollsStatus.reportsByPollingPlace[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];
    // Activity log contains every transition type plus an entry referencing
    // a polling place ID not in the election (to exercise the fallback).
    const activityLogEntries: QuickReportedPollStatus[] = [
      {
        machineId: 'VxScan-open',
        pollsTransitionType: 'open_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T07:00:00Z'),
      },
      {
        machineId: 'VxScan-paused',
        pollsTransitionType: 'pause_voting',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T08:00:00Z'),
      },
      {
        machineId: 'VxScan-resumed',
        pollsTransitionType: 'resume_voting',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T09:00:00Z'),
      },
      {
        machineId: 'VxScan-closed',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
      {
        machineId: 'VxScan-orphan',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: 'unknown-place-id',
        signedTimestamp: new Date('2024-01-01T19:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    apiMock.getLiveReportsActivityLog
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(createMockActivityLog(activityLogEntries)));

    renderScreen();

    await screen.findByRole('heading', { name: 'Live Reports' });

    // Each transition type is rendered
    await screen.findByText(/VxScan-open: Polls Open/);
    screen.getByText(/VxScan-paused: Polls Paused/);
    screen.getByText(/VxScan-resumed: Polls Resumed/);
    screen.getByText(/VxScan-closed: Polls Closed/);
    // Orphan entry shows the raw polling place ID as a fallback
    screen.getByText('unknown-place-id');
  });

  test('precinct dropdown navigates back to all precincts when "All Precincts" is selected', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatus(election, true);
    pollsStatus.reportsByPollingPlace[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];

    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();
    await screen.findByRole('heading', { name: 'Live Reports' });

    // Navigate to tally report view
    const allPrecinctsResults = createMockAggregatedResults(election, true);
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(allPrecinctsResults));
    userEvent.click(screen.getByRole('button', { name: 'View Tally Reports' }));
    await screen.findAllByText(/Unofficial.*Tally Report/);

    // Select a single precinct
    const singlePrecinctResults = createMockAggregatedResults(election, true);
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: singlePrecinctSelectionFor(election.precincts[0].id),
      })
      .resolves(ok(singlePrecinctResults));
    const precinctSelect = screen.getByRole('combobox', {
      name: 'Select precinct',
    });
    userEvent.click(precinctSelect);
    userEvent.click(
      await screen.findByRole('option', {
        name: election.precincts[0].name,
      })
    );
    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    });

    // Now go back to "All Precincts" - expect another call for the all-precincts path
    apiMock.getLiveResultsReports
      .expectCallWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(allPrecinctsResults));
    userEvent.click(screen.getByRole('combobox', { name: 'Select precinct' }));
    userEvent.click(
      await screen.findByRole('option', { name: 'All Precincts' })
    );
    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    });
  });

  test('tally report page shows error state when election is out of date', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatus(election, true);
    pollsStatus.reportsByPollingPlace[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();
    await screen.findByRole('heading', { name: 'Live Reports' });

    apiMock.getLiveResultsReports
      .expectRepeatedCallsWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(err('election-out-of-date'));

    userEvent.click(screen.getByRole('button', { name: 'View Tally Reports' }));

    await screen.findByText(
      /This election is no longer compatible with Live Reports/
    );
  });

  test('tally report page shows "No results reported" when no machines have reported', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);

    const pollsStatus = createMockPollsStatus(election, true);
    pollsStatus.reportsByPollingPlace[election.precincts[0].id] = [
      {
        machineId: 'VxScan-001',
        pollsTransitionType: 'close_polls',
        pollingPlaceId: election.precincts[0].id,
        signedTimestamp: new Date('2024-01-01T18:00:00Z'),
      },
    ];
    apiMock.getLiveReportsSummary
      .expectRepeatedCallsWith({ electionId })
      .resolves(ok(pollsStatus));
    mockEmptyActivityLogForAllTabs(electionId);

    renderScreen();
    await screen.findByRole('heading', { name: 'Live Reports' });

    // Return results with no machinesReporting
    const fullResults = createMockAggregatedResults(election, true);
    const emptyResults: typeof fullResults = {
      ...fullResults,
      machinesReporting: [],
    };
    apiMock.getLiveResultsReports
      .expectRepeatedCallsWith({
        electionId,
        precinctSelection: ALL_PRECINCTS_SELECTION,
      })
      .resolves(ok(emptyResults));

    userEvent.click(screen.getByRole('button', { name: 'View Tally Reports' }));

    await screen.findByText('No results reported.');
  });
});
