import { test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
  ALL_PRECINCTS_SELECTION,
} from '@votingworks/utils';
import { PrintReadinessReport } from './print_readiness_report';
import { render, screen } from '../../test/react_testing_library';
import {
  MOCK_MARKER_INFO,
  MOCK_PRINTER_CONFIG,
} from './admin_readiness_report.test';

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

test('PrintReadinessReport', () => {
  mockFeatureFlagger.disableFeatureFlag(ENABLE_POLLING_PLACES);
  testReport('Precinct: All Precincts');
});

test('PrintReadinessReport - polling places enabled', () => {
  mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);
  testReport(`Polling Place: ${selectedPollingPlace.name}`);
});

// [TODO] Merge into test after migration to polling places.
function testReport(expectedPrecinctOrPollingPlaceString: string) {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <PrintReadinessReport
      batteryInfo={{
        level: 0.5,
        discharging: true,
      }}
      diskSpaceSummary={{
        total: 1000000000,
        available: 500000000,
        used: 500000000,
      }}
      pollingPlaceId={selectedPollingPlace.id}
      precinctSelection={precinctSelection}
      printerStatus={{
        connected: true,
        config: MOCK_PRINTER_CONFIG,
        richStatus: {
          state: 'idle',
          stateReasons: [],
          markerInfos: [MOCK_MARKER_INFO],
        },
      }}
      mostRecentPrinterDiagnostic={{
        type: 'test-print',
        outcome: 'pass',
        timestamp: generatedAtTime.getTime(),
      }}
      electionDefinition={electionDef}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={generatedAtTime}
      machineId={machineId}
    />
  );
  screen.getByText('VxPrint Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'));
  screen.getByText(/Example Primary Election/);
  screen.getByText(expectedPrecinctOrPollingPlaceString);
  screen.getByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Ready to print');
  screen.getByText('Toner Level: 100%');
  screen.getByText('Test print successful, 1/1/2022, 12:00:00 AM');
}
