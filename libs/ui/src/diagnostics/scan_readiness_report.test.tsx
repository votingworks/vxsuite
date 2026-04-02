import { test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
  ALL_PRECINCTS_SELECTION,
} from '@votingworks/utils';
import { ScanReadinessReport } from '.';
import { render, screen } from '../../test/react_testing_library';

const mockFeatureFlagger = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);

const electionDef = readElectionTwoPartyPrimaryDefinition();
const { election } = electionDef;
const precinctSelection = ALL_PRECINCTS_SELECTION;
const selectedPollingPlace = assertDefined(election.pollingPlaces)[0];

test('ScanReadinessReport', () => {
  mockFeatureFlagger.disableFeatureFlag(ENABLE_POLLING_PLACES);
  testReport('Precinct: All Precincts');
});

test('ScanReadinessReport - polling places enabled', () => {
  mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);
  testReport(`Polling Place: ${selectedPollingPlace.name}`);
});

// [TODO] Merge into test after migration to polling places.
function testReport(expectedPrecinctOrPollingPlaceString: string) {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <ScanReadinessReport
      generatedAtTime={generatedAtTime}
      machineId={machineId}
      diskSpaceSummary={{
        total: 1_000_000_000,
        available: 500_000_000,
        used: 500_000_000,
      }}
      scannerStatus={{ state: 'waiting_for_ballot' }}
      printerStatus={{
        state: 'idle',
      }}
      mostRecentPrinterDiagnostic={{
        type: 'test-print',
        outcome: 'pass',
        timestamp: generatedAtTime.getTime(),
      }}
      electionDefinition={electionDef}
      electionPackageHash="mock-election-package-hash"
      pollingPlaceId={selectedPollingPlace.id}
      precinctSelection={precinctSelection}
    />
  );

  screen.getByText('VxScan Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'));

  screen.getByText(/Example Primary Election/);

  screen.getByText(expectedPrecinctOrPollingPlaceString);

  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');

  screen.getByText('The scanner is connected.');

  screen.getByText('The printer is loaded with paper and ready to print.');

  screen.getByText('Test print successful, 1/1/2022, 12:00:00 AM');
}
