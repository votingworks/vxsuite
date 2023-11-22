import { Scan } from '@votingworks/api';
import { AdjudicationStatus } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';
import {
  ScanBallotsScreen,
  ScanBallotsScreenProps,
} from './scan_ballots_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { MockApiClient, createMockApiClient } from '../../test/api';

const noneLeftAdjudicationStatus: AdjudicationStatus = {
  adjudicated: 0,
  remaining: 0,
};

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
});

afterEach(() => {
  mockApiClient.assertComplete();
});

function renderScreen(props?: Partial<ScanBallotsScreenProps>) {
  return renderInAppContext(
    <ScanBallotsScreen
      isScannerAttached
      isExportingCvrs={false}
      isScanning={false}
      setIsExportingCvrs={jest.fn()}
      scanBatch={jest.fn()}
      status={{
        canUnconfigure: false,
        batches: [],
        adjudication: noneLeftAdjudicationStatus,
      }}
      {...props}
    />,
    { apiClient: mockApiClient }
  );
}

test('null state', () => {
  renderScreen();
  screen.getByText('No ballots have been scanned');
});

test('shows scanned ballot count', () => {
  const status: Scan.GetScanStatusResponse = {
    canUnconfigure: false,
    batches: [
      {
        id: 'a',
        batchNumber: 1,
        count: 1,
        label: 'Batch 1',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
      {
        id: 'b',
        batchNumber: 2,
        count: 3,
        label: 'Batch 2',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
  };
  renderScreen({ status });
  screen.getByText(
    hasTextAcrossElements(
      'A total of 4 ballots have been scanned in 2 batches.'
    )
  );
});

test('shows whether a batch is scanning', () => {
  const status: Scan.GetScanStatusResponse = {
    canUnconfigure: false,
    batches: [
      {
        id: 'a',
        batchNumber: 1,
        label: 'Batch 1',
        count: 3,
        startedAt: new Date(0).toISOString(),
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
  };
  renderScreen({ isScanning: true, status });
  screen.getByText('Scanning…');
  for (const deleteButton of screen.getAllButtons('Delete')) {
    expect(deleteButton).toBeDisabled();
  }
});
