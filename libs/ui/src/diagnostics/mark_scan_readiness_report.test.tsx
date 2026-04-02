import { expect, test, vi } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';
import { MarkScanReadinessReport } from './mark_scan_readiness_report';
import { render, screen } from '../../test/react_testing_library';
import { expectConnectionStatus, expectDiagnosticResult } from './test_utils';
import { DiagnosticSectionTitle } from './types';

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

test('MarkScanReadinessReport', () => {
  mockFeatureFlagger.disableFeatureFlag(ENABLE_POLLING_PLACES);
  testReport('Precinct: All Precincts');
});

test('MarkScanReadinessReport - polling places enabled', () => {
  mockFeatureFlagger.enableFeatureFlag(ENABLE_POLLING_PLACES);
  testReport(`Polling Place: ${selectedPollingPlace.name}`);
});

// [TODO] Merge into test after migration to polling places.
function testReport(expectedPrecinctOrPollingPlaceString: string) {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <MarkScanReadinessReport
      diskSpaceSummary={{
        total: 1000000000,
        available: 500000000,
        used: 500000000,
      }}
      accessibleControllerProps={{
        mostRecentDiagnosticRecord: {
          type: 'mark-scan-accessible-controller',
          outcome: 'pass',
          timestamp: generatedAtTime.getTime(),
        },
        isDeviceConnected: true,
        children: <p>passed controller child</p>,
      }}
      paperHandlerProps={{
        mostRecentDiagnosticRecord: {
          type: 'mark-scan-paper-handler',
          outcome: 'pass',
          timestamp: generatedAtTime.getTime(),
        },
        isDeviceConnected: true,
        children: <p>passed paper handler child</p>,
      }}
      patInputProps={{
        mostRecentDiagnosticRecord: {
          type: 'mark-scan-pat-input',
          outcome: 'pass',
          timestamp: generatedAtTime.getTime(),
        },
        isDeviceConnected: true,
        children: <p>passed PAT input child</p>,
      }}
      headphoneInputProps={{
        mostRecentDiagnosticRecord: {
          type: 'mark-scan-headphone-input',
          outcome: 'pass',
          timestamp: generatedAtTime.getTime(),
        },
        children: <p>passed headphone input child</p>,
      }}
      upsProps={{
        mostRecentDiagnosticRecord: {
          type: 'uninterruptible-power-supply',
          outcome: 'pass',
          timestamp: generatedAtTime.getTime(),
        },
        children: <p>passed UPS child</p>,
      }}
      generatedAtTime={generatedAtTime}
      machineId={machineId}
      electionDefinition={electionDef}
      electionPackageHash="test-election-package-hash"
      precinctSelection={precinctSelection}
      pollingPlaceId={selectedPollingPlace.id}
    />
  );

  screen.getByText('VxMarkScan Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'));
  screen.getByText(/Example Primary Election/);
  screen.getByText(expectedPrecinctOrPollingPlaceString);
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');
  expectConnectionStatus(
    expect,
    screen,
    DiagnosticSectionTitle.PaperHandler,
    'Connected'
  );
  expectConnectionStatus(
    expect,
    screen,
    DiagnosticSectionTitle.AccessibleController,
    'Connected'
  );
  expectConnectionStatus(
    expect,
    screen,
    DiagnosticSectionTitle.PatInput,
    'Available'
  );
  expectDiagnosticResult(
    expect,
    screen,
    DiagnosticSectionTitle.PaperHandler,
    true
  );
  expectDiagnosticResult(expect, screen, DiagnosticSectionTitle.PatInput, true);
  expectDiagnosticResult(
    expect,
    screen,
    DiagnosticSectionTitle.FrontHeadphoneInput,
    true
  );
  expectDiagnosticResult(
    expect,
    screen,
    DiagnosticSectionTitle.FrontHeadphoneInput,
    true
  );
  expectDiagnosticResult(expect, screen, DiagnosticSectionTitle.Ups, true);
  expectDiagnosticResult(
    expect,
    screen,
    DiagnosticSectionTitle.AccessibleController,
    true
  );
  screen.getByText('passed controller child');
  screen.getByText('passed paper handler child');
  screen.getByText('passed PAT input child');
  screen.getByText('passed headphone input child');
  screen.getByText('passed UPS child');
}
