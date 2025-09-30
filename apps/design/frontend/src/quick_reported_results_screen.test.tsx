import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { cleanup, screen, waitFor } from '@testing-library/react';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  ElectionId,
} from '@votingworks/types';
import {
  buildElectionResultsFixture,
  ContestResultsSummaries,
} from '@votingworks/utils';
import type { AggregatedReportedResults } from '@votingworks/design-backend';
import { err, ok } from '@votingworks/basics';
import { render } from '../test/react_testing_library';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { QuickReportedResultsScreen } from './quick_reported_results_screen';
import { generalElectionRecord } from '../test/fixtures';

const electionRecord = generalElectionRecord(user.orgId);
const electionId = electionRecord.election.id;
const { election } = electionRecord;

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
  const { path } = routes.election(electionIdParam).results;
  const paramPath = routes.election(':electionId').results.path;
  // console.log('Rendering with path:', path, 'paramPath:', paramPath);
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<QuickReportedResultsScreen />, {
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

// Helper function to create mock aggregated results using buildElectionResultsFixture
function createMockAggregatedResults(
  electionData: typeof election
): AggregatedReportedResults {
  // Create contest results summaries for buildElectionResultsFixture
  const contestResultsSummaries: ContestResultsSummaries = {};

  for (const contest of electionData.contests) {
    if (contest.type === 'candidate') {
      // Create officialOptionTallies for candidate contests
      const officialOptionTallies: Record<string, number> = {};
      for (const [index, candidate] of contest.candidates.entries()) {
        officialOptionTallies[candidate.id] = 100 + index * 10;
      }

      contestResultsSummaries[contest.id] = {
        type: 'candidate',
        ballots: 200,
        overvotes: 5,
        undervotes: 10,
        officialOptionTallies,
      };
    } else if (contest.type === 'yesno') {
      contestResultsSummaries[contest.id] = {
        type: 'yesno',
        ballots: 240,
        overvotes: 3,
        undervotes: 7,
        yesTally: 150,
        noTally: 80,
      };
    }
  }

  // Build proper election results using the utility function
  const electionResults = buildElectionResultsFixture({
    election: electionData,
    contestResultsSummaries,
    cardCounts: {
      bmd: 50,
      hmpb: [150],
    },
    includeGenericWriteIn: false,
  });

  return {
    ballotHash: 'abc123def456',
    machinesReporting: ['VxScan-001', 'VxScan-002'],
    election: electionData,
    contestResults: electionResults.contestResults,
  };
}

const mockAggregatedResults: AggregatedReportedResults =
  createMockAggregatedResults(election);

describe('Navigation tab visibility', () => {
  test('Results tab appears in navigation when quickResultsReportingUrl is configured', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);
    apiMock.getQuickReportedResults
      .expectCallWith({ electionId, isLive: true })
      .resolves(ok(mockAggregatedResults));

    renderScreen();

    // Wait for the component to potentially load
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Quick Reported Results' })
      ).toBeInTheDocument();
    });

    const resultsNavButton = screen.getByRole('button', { name: 'Results' });
    expect(resultsNavButton).toBeInTheDocument();
  });

  test('screen still works when quickResultsReportingUrl is not configured', async () => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithoutUrl);
    // Component still calls getQuickReportedResults even when URL is not configured
    apiMock.getQuickReportedResults
      .expectCallWith({ electionId, isLive: true })
      .resolves(ok(mockAggregatedResults));

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Quick Reported Results' })
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'This election does not have Quick Results Reporting enabled.'
      )
    ).toBeInTheDocument();

    // There should not be a link to this page in the navigation.
    expect(
      screen.queryByRole('button', { name: 'Results' })
    ).not.toBeInTheDocument();
  });
});

test('shows error message when election is not exported', async () => {
  apiMock.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(mockSystemSettingsWithUrl);
  apiMock.getQuickReportedResults
    .expectRepeatedCallsWith({ electionId, isLive: true })
    .resolves(err('election-not-exported'));

  renderScreen();

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: 'Quick Reported Results' })
    ).toBeInTheDocument();
  });
  expect(
    screen.getByText(
      'This election has not yet been exported. Please export the election and configure VxScan to report results.'
    )
  ).toBeInTheDocument();
});

test('Live/Test toggle works correctly', async () => {
  apiMock.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(mockSystemSettingsWithUrl);

  // Initial load with isLive: true
  apiMock.getQuickReportedResults
    .expectCallWith({ electionId, isLive: true })
    .resolves(ok(mockAggregatedResults));

  renderScreen();

  // Wait for the component to fully load with results and the SegmentedButton
  await waitFor(() => {
    expect(screen.getByText('Report Information')).toBeInTheDocument();
  });

  // Verify SegmentedButton options are present (handle multiple instances)
  expect(
    screen.getAllByRole('option', { name: 'Live' }).length
  ).toBeGreaterThanOrEqual(1);
  expect(
    screen.getAllByRole('option', { name: 'Test (L&A)' }).length
  ).toBeGreaterThanOrEqual(1);

  // Mock the API call for Test mode
  const testModeResults: AggregatedReportedResults = {
    ...mockAggregatedResults,
  };
  apiMock.getQuickReportedResults
    .expectCallWith({ electionId, isLive: false })
    .resolves(ok(testModeResults));

  // Click Test mode
  userEvent.click(screen.getByRole('option', { name: 'Test (L&A)' }));

  await waitFor(() => {
    expect(
      screen.getByRole('option', { name: 'Test (L&A)', selected: true })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Live', selected: false })
    ).toBeInTheDocument();
  });
});

describe('Results display', () => {
  beforeEach(() => {
    apiMock.getSystemSettings
      .expectRepeatedCallsWith({ electionId })
      .resolves(mockSystemSettingsWithUrl);
    apiMock.getQuickReportedResults
      .expectRepeatedCallsWith({ electionId, isLive: true })
      .resolves(ok(mockAggregatedResults));
  });

  test('displays report information correctly', async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Report Information')).toBeInTheDocument();
    });
    // Check report information section
    expect(screen.getByText('Ballot Hash:')).toBeInTheDocument();
    // Check for formatted ballot hash (formatBallotHash truncates to 7 chars)
    expect(screen.getByText('abc123d')).toBeInTheDocument();
    expect(screen.getByText('Machine Ids Reporting:')).toBeInTheDocument();
    expect(screen.getByText('VxScan-001, VxScan-002')).toBeInTheDocument();

    // Check results section (handle multiple instances)
    expect(
      screen.getAllByRole('heading', { level: 2, name: 'Results' }).length
    ).toBeGreaterThanOrEqual(1);

    // There should be contest results tables for each contest
    const tables = screen.getAllByRole('table');
    expect(tables.length).toEqual(election.contests.length);
  });

  test('shows "No results reported" when no machines are reporting', async () => {
    const noResultsData: AggregatedReportedResults = {
      ...mockAggregatedResults,
      machinesReporting: [],
    };
    apiMock.getQuickReportedResults.reset();
    apiMock.getQuickReportedResults
      .expectRepeatedCallsWith({ electionId, isLive: true })
      .resolves(ok(noResultsData));

    renderScreen();

    // Wait for the component to fully load first
    await waitFor(() => {
      expect(screen.getByText('Report Information')).toBeInTheDocument();
    });

    // Look for the "No results reported." text
    expect(screen.getByText('No results reported.')).toBeInTheDocument();
  });
});
