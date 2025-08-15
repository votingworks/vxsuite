import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  electionSimpleSinglePrecinctFixtures,
  electionMultiPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import type {
  SummaryStatistics,
  PrimarySummaryStatistics,
  ThroughputStat,
} from '@votingworks/pollbook-backend';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { act, screen, waitFor } from '../test/react_testing_library';
import {
  StatisticsScreen,
  GeneralElectionStatistics,
  PrimaryElectionStatistics,
  ThroughputChart,
} from './statistics_screen';

// Mock Chart.js components since they don't render properly in test environment
vi.mock('react-chartjs-2', () => ({
  Bar: vi.fn(({ data, options }) => (
    <div data-testid="chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  )),
}));

// Mock chartjs-adapter-date-fns
vi.mock('chartjs-adapter-date-fns', () => ({}));

// Mock Chart.js and plugins
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn(),
    defaults: {
      font: { size: 16 },
    },
  },
  TimeScale: {},
  LinearScale: {},
  BarElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

// Mock chartjs-plugin-datalabels
vi.mock('chartjs-plugin-datalabels', () => ({
  default: {},
}));

let apiMock: ApiMock;
let unmount: () => void;

// Sample data for testing
const mockGeneralSummaryStatistics: SummaryStatistics = {
  totalVoters: 1000,
  totalCheckIns: 450,
  totalNewRegistrations: 50,
  totalAbsenteeCheckIns: 100,
};

const mockPrimarySummaryStatistics: PrimarySummaryStatistics = {
  totalVoters: 800,
  totalCheckIns: 320,
  totalNewRegistrations: 30,
  totalAbsenteeCheckIns: 80,
  totalUndeclaredDemCheckIns: 25,
  totalUndeclaredRepCheckIns: 35,
};

const mockThroughputData: ThroughputStat[] = [
  {
    interval: 60,
    checkIns: 15,
    startTime: '2025-08-04T08:00:00.000Z',
  },
  {
    interval: 60,
    checkIns: 25,
    startTime: '2025-08-04T09:00:00.000Z',
  },
  {
    interval: 60,
    checkIns: 30,
    startTime: '2025-08-04T10:00:00.000Z',
  },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  vi.clearAllMocks();

  if (unmount) {
    unmount();
  }

  vi.useRealTimers();
});

describe('StatisticsScreen', () => {
  test('renders GeneralElectionStatistics for general election', async () => {
    const electionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    // Mock the statistics APIs
    apiMock.mockApiClient.getGeneralSummaryStatistics
      .expectRepeatedCallsWith({ partyFilter: 'ALL' })
      .resolves(mockGeneralSummaryStatistics);

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<StatisticsScreen />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Statistics' })
      ).toBeInTheDocument();
      expect(screen.getByText('Check-Ins')).toBeInTheDocument();
    });
  });

  test('renders PrimaryElectionStatistics for primary election', async () => {
    const electionDefinition =
      electionMultiPartyPrimaryFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    // Mock the statistics APIs
    apiMock.mockApiClient.getPrimarySummaryStatistics
      .expectRepeatedCallsWith({ partyFilter: 'ALL' })
      .resolves(mockPrimarySummaryStatistics);

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<StatisticsScreen />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Statistics' })
      ).toBeInTheDocument();
      expect(screen.getByText('Check-Ins')).toBeInTheDocument();
    });
  });
});

describe('GeneralElectionStatistics', () => {
  test('displays summary statistics correctly', async () => {
    const electionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();
    apiMock.setElection(electionDefinition);

    apiMock.expectGetDeviceStatuses();

    apiMock.mockApiClient.getGeneralSummaryStatistics
      .expectRepeatedCallsWith({ partyFilter: 'ALL' })
      .resolves({
        totalVoters: 1000,
        totalCheckIns: 450,
        totalNewRegistrations: 50,
        totalAbsenteeCheckIns: 100,
      });

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<GeneralElectionStatistics />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(screen.getByText('Check-Ins')).toBeInTheDocument();
      expect(screen.getAllByText('Voters')[1]).toBeInTheDocument(); // Use the second "Voters" (content, not nav)
    });

    // Check-ins card
    expect(screen.getByText(/450/)).toBeInTheDocument(); // Total check-ins
    expect(screen.getByText('350')).toBeInTheDocument(); // Precinct check-ins (450 - 100)
    expect(screen.getByText('100')).toBeInTheDocument(); // Absentee check-ins

    // Voters card
    expect(screen.getByText('1,000')).toBeInTheDocument(); // Total voters
    expect(screen.getByText('950')).toBeInTheDocument(); // Imported voters (1000 - 50)
    expect(screen.getByText('50')).toBeInTheDocument(); // Added voters
  });

  test('party filter works correctly', async () => {
    const electionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    // Initial load with ALL filter
    apiMock.mockApiClient.getGeneralSummaryStatistics
      .expectRepeatedCallsWith({ partyFilter: 'ALL' })
      .resolves(mockGeneralSummaryStatistics);

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<GeneralElectionStatistics />, {
      apiMock,
    }));

    await waitFor(() => {
      screen.getByRole('heading', { name: 'Precinct Voter Throughput' });
      screen.getByText('1,000'); // Look for total voters count
    });

    // Click on Democrat filter (it has role="option")
    const demButton = screen.getByRole('option', { name: 'Dem' });

    // After clicking DEM filter
    apiMock.mockApiClient.getGeneralSummaryStatistics
      .expectCallWith({ partyFilter: 'DEM' })
      .resolves({
        totalVoters: 400,
        totalCheckIns: 180,
        totalNewRegistrations: 20,
        totalAbsenteeCheckIns: 40,
      });
    act(() => {
      userEvent.click(demButton);
    });

    await waitFor(() => {
      screen.getByText('400');
    });
  });

  test('renders throughput chart', async () => {
    const electionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    apiMock.mockApiClient.getGeneralSummaryStatistics
      .expectRepeatedCallsWith({ partyFilter: 'ALL' })
      .resolves(mockGeneralSummaryStatistics);

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<GeneralElectionStatistics />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(
        screen.getAllByText('Precinct Voter Throughput')[0]
      ).toBeInTheDocument();
      expect(screen.getAllByTestId('chart')[0]).toBeInTheDocument();
    });
  });
});

describe('PrimaryElectionStatistics', () => {
  test('displays primary election statistics correctly', async () => {
    const electionDefinition =
      electionMultiPartyPrimaryFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    apiMock.mockApiClient.getPrimarySummaryStatistics
      .expectRepeatedCallsWith({ partyFilter: 'ALL' })
      .resolves({
        totalVoters: 800,
        totalCheckIns: 320,
        totalNewRegistrations: 30,
        totalAbsenteeCheckIns: 80,
        totalUndeclaredDemCheckIns: 25,
        totalUndeclaredRepCheckIns: 35,
      });

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<PrimaryElectionStatistics />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(screen.getByText('Check-Ins')).toBeInTheDocument();
      expect(screen.getAllByText('Voters')[1]).toBeInTheDocument(); // Use the second "Voters" (content, not nav)
    });

    // Check-ins card
    expect(screen.getByText(/320/)).toBeInTheDocument(); // Total check-ins
    expect(screen.getByText('240')).toBeInTheDocument(); // Precinct check-ins (320 - 80)
    expect(screen.getByText('80')).toBeInTheDocument(); // Absentee check-ins

    // Voters card
    expect(screen.getByText('800')).toBeInTheDocument(); // Total voters
    expect(screen.getByText('770')).toBeInTheDocument(); // Imported voters (800 - 30)
    expect(screen.getByText('30')).toBeInTheDocument(); // Added voters
  });

  test('shows undeclared voter statistics when UND filter is selected', async () => {
    const electionDefinition =
      electionMultiPartyPrimaryFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    // Initial load with ALL filter
    apiMock.mockApiClient.getPrimarySummaryStatistics
      .expectCallWith({ partyFilter: 'ALL' })
      .resolves(mockPrimarySummaryStatistics);

    apiMock.mockApiClient.getThroughputStatistics
      .expectCallWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    // After clicking UND filter
    apiMock.mockApiClient.getPrimarySummaryStatistics
      .expectCallWith({ partyFilter: 'UND' })
      .resolves({
        totalVoters: 200,
        totalCheckIns: 60,
        totalNewRegistrations: 10,
        totalAbsenteeCheckIns: 15,
        totalUndeclaredDemCheckIns: 25,
        totalUndeclaredRepCheckIns: 35,
      });

    ({ unmount } = renderInAppContext(<PrimaryElectionStatistics />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Statistics' })
      ).toBeInTheDocument();
    });

    // Click on Undeclared filter (it has role="option") - use the first one in the content area
    const undButton = screen.getByRole('option', { name: 'Und' });
    act(() => {
      userEvent.click(undButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Declared Party')).toBeInTheDocument();
      expect(screen.getByText('Democratic')).toBeInTheDocument();
      expect(screen.getByText('Republican')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument(); // Dem undeclared check-ins
      expect(screen.getByText('35')).toBeInTheDocument(); // Rep undeclared check-ins
    });
  });
});

describe('ThroughputChart', () => {
  test('renders chart with data', async () => {
    const electionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    ({ unmount } = renderInAppContext(<ThroughputChart partyFilter="ALL" />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(
        screen.getAllByText('Precinct Voter Throughput')[0]
      ).toBeInTheDocument();
      expect(screen.getAllByTestId('chart')[0]).toBeInTheDocument();
    });

    // Verify chart data contains our mock data
    const chartData = screen.getAllByTestId('chart-data')[0];
    expect(chartData.textContent).toContain('Check-Ins');
    expect(chartData.textContent).toContain('15'); // First data point
    expect(chartData.textContent).toContain('25'); // Second data point
    expect(chartData.textContent).toContain('30'); // Third data point
  });

  test('interval selector changes throughput data', async () => {
    const electionDefinition =
      electionSimpleSinglePrecinctFixtures.readElectionDefinition();

    apiMock.setElection(electionDefinition);
    apiMock.expectGetDeviceStatuses();

    // Initial 60 minute interval data
    apiMock.mockApiClient.getThroughputStatistics
      .expectCallWith({ throughputInterval: 60, partyFilter: 'ALL' })
      .resolves(mockThroughputData);

    // 30 minute interval data after clicking
    apiMock.mockApiClient.getThroughputStatistics
      .expectRepeatedCallsWith({ throughputInterval: 30, partyFilter: 'ALL' })
      .resolves([
        {
          interval: 30,
          checkIns: 8,
          startTime: '2025-08-04T08:00:00.000Z',
        },
        {
          interval: 30,
          checkIns: 12,
          startTime: '2025-08-04T08:30:00.000Z',
        },
      ]);

    ({ unmount } = renderInAppContext(<ThroughputChart partyFilter="ALL" />, {
      apiMock,
    }));

    await waitFor(() => {
      expect(
        screen.getAllByText('Precinct Voter Throughput')[0]
      ).toBeInTheDocument();
    });

    // Click 30m interval button (it has role="option" not "button") - use the last one which should be in the chart area
    const thirtyMinButtons = screen.getAllByRole('option', { name: '30m' });
    const thirtyMinButton = thirtyMinButtons[thirtyMinButtons.length - 1]; // Use the last one (chart area)
    act(() => {
      userEvent.click(thirtyMinButton);
    });

    await waitFor(() => {
      const chartData = screen.getAllByTestId('chart-data')[0];
      expect(chartData.textContent).toContain('8'); // New data point
      expect(chartData.textContent).toContain('12'); // New data point
    });
  });
});
