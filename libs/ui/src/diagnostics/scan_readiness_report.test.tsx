import { hasTextAcrossElements } from '@votingworks/test-utils';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { ScanReadinessReport } from '.';
import { render, screen } from '../../test/react_testing_library';

test('ScanReadinessReport', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <ScanReadinessReport
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
      printerStatus={{
        state: 'idle',
      }}
      mostRecentPrinterDiagnostic={{
        type: 'test-print',
        outcome: 'pass',
        timestamp: generatedAtTime.getTime(),
      }}
      electionDefinition={electionTwoPartyPrimaryDefinition}
    />
  );

  screen.getByText('VxScan Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(
    hasTextAcrossElements('Date: Saturday, January 1, 2022 at 12:00:00 AM AKST')
  );

  screen.getByText(/Example Primary Election/);
  screen.getByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');

  screen.getByText('The printer is loaded with paper and ready to print.');

  screen.getByText('Diagnostic test print successful, 1/1/2022, 12:00:00 AM');
});
