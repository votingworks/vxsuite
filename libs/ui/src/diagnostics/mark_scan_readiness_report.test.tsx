import { expect, test } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { MarkScanReadinessReport } from './mark_scan_readiness_report';
import { render, screen } from '../../test/react_testing_library';
import { expectConnectionStatus, expectDiagnosticResult } from './test_utils';
import { DiagnosticSectionTitle } from './types';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('MarkScanReadinessReport', () => {
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
      generatedAtTime={generatedAtTime}
      machineId={machineId}
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      precinctSelection={ALL_PRECINCTS_SELECTION}
    />
  );

  screen.getByText('VxMark Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'));
  screen.getByText(/Example Primary Election/);
  screen.getByText(/All Precincts/);
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
    DiagnosticSectionTitle.HeadphoneInput,
    true
  );
  expectDiagnosticResult(
    expect,
    screen,
    DiagnosticSectionTitle.HeadphoneInput,
    true
  );
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
});
