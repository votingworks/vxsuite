import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { CentralScanReadinessReport } from '.';
import { render, screen } from '../../test/react_testing_library';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('CentralScanReadinessReport', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <CentralScanReadinessReport
      generatedAtTime={generatedAtTime}
      machineId={machineId}
      batteryInfo={{
        level: 0.5,
        discharging: true,
      }}
      diskSpaceSummary={{
        total: 1_000_000_000,
        available: 500_000_000,
        used: 500_000_000,
      }}
      isScannerAttached
      mostRecentScannerDiagnostic={{
        type: 'blank-sheet-scan',
        outcome: 'pass',
        timestamp: generatedAtTime.getTime(),
      }}
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
    />
  );

  screen.getByText('VxCentralScan Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(
    hasTextAcrossElements('Date: Saturday, January 1, 2022 at 12:00:00 AM AKST')
  );

  screen.getByText(/Example Primary Election/);
  screen.getByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');

  screen.getByText('Connected');

  screen.getByText('Test scan successful, 1/1/2022, 12:00:00 AM');
});
