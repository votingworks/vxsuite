import { expect, test, vi } from 'vite-plus/test';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName as Feature,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { BatchInfo, formatElectionHashes } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import { PrecinctScannerBallotCountReport } from './precinct_scanner_ballot_count_report';

const mockFeatureFlagger = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f: Feature) => mockFeatureFlagger.isEnabled(f),
}));

const electionGeneralDefinition = readElectionGeneralDefinition();
const pollsTransitionedTime = new Date(2021, 8, 19, 11, 5).getTime();
const reportPrintedTime = new Date(2021, 8, 19, 11, 6).getTime();

const testBatches: BatchInfo[] = [
  {
    id: 'a3c38c4b-0012-4ab1-b4ef-0d95671595ca',
    batchNumber: 1,
    label: 'Batch 1',
    startedAt: '2021-09-19T10:00:00.000Z',
    endedAt: '2021-09-19T11:05:00.000Z',
    count: 23,
  },
];

test('renders info properly', () => {
  setPollingPlacesEnabled(true);

  const { election } = electionGeneralDefinition;
  const [pollingPlace] = assertDefined(election.pollingPlaces);

  render(
    <PrecinctScannerBallotCountReport
      electionDefinition={electionGeneralDefinition}
      electionPackageHash="test-election-package-hash"
      pollingPlaceId={pollingPlace.id}
      totalBallotsScanned={23}
      mostRecentBatchCount={10}
      batches={testBatches}
      pollsTransition="pause_voting"
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      isLiveMode={false}
      precinctScannerMachineId="SC-01-000"
    />
  );

  // Check header
  screen.getByText('Test Report');
  screen.getByText(`Voting Paused Report • ${pollingPlace.name}`);
  screen.getByText(
    'General Election, Nov 3, 2020, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Voting Paused:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Voting Paused: Sep 19, 2021, 11:05:00 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06:00 AM'
  );
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionGeneralDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  // Check contents
  const totalLabel = screen.getByText('Total Sheets Scanned:');
  expect(totalLabel.nextElementSibling).toHaveTextContent('23');
  const batchLabel = screen.getByText('Most Recent Batch:');
  expect(batchLabel.nextElementSibling).toHaveTextContent('10');

  expect(screen.queryByText('Polls Status')).toBeNull();
  expect(screen.queryByText('Time Voting Paused')).toBeNull();
});

test('renders precinct selection', () => {
  setPollingPlacesEnabled(false);

  render(
    <PrecinctScannerBallotCountReport
      electionDefinition={electionGeneralDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
      totalBallotsScanned={23}
      mostRecentBatchCount={23}
      batches={testBatches}
      pollsTransition="pause_voting"
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      isLiveMode={false}
      precinctScannerMachineId="SC-01-000"
    />
  );

  screen.getByText('Voting Paused Report • All Precincts');
});

test('omits most recent batch count on resume_voting', () => {
  setPollingPlacesEnabled(false);

  render(
    <PrecinctScannerBallotCountReport
      electionDefinition={electionGeneralDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
      totalBallotsScanned={23}
      batches={testBatches}
      pollsTransition="resume_voting"
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      isLiveMode={false}
      precinctScannerMachineId="SC-01-000"
    />
  );

  expect(screen.queryByText('Most Recent Batch Scan Count')).toBeNull();
});

test('renders batch summary table', () => {
  setPollingPlacesEnabled(false);

  render(
    <PrecinctScannerBallotCountReport
      electionDefinition={electionGeneralDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
      totalBallotsScanned={23}
      mostRecentBatchCount={23}
      batches={testBatches}
      pollsTransition="pause_voting"
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      isLiveMode={false}
      precinctScannerMachineId="SC-01-000"
    />
  );

  screen.getByText('Batch ID');
  screen.getByText('Sheets Scanned');
  screen.getByText('Polls Opened / Resumed');
  screen.getByText('a3c38c4b-0d95671595ca');
});

function setPollingPlacesEnabled(enabled: boolean) {
  if (enabled) {
    mockFeatureFlagger.enableFeatureFlag(Feature.ENABLE_POLLING_PLACES);
  } else {
    mockFeatureFlagger.disableFeatureFlag(Feature.ENABLE_POLLING_PLACES);
  }
}
