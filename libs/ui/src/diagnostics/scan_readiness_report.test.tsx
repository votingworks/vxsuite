import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { ScanReadinessReport } from '.';
import { render, screen } from '../../test/react_testing_library';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('ScanReadinessReport', () => {
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
      scannerStatus={{ state: 'no_paper' }}
      printerStatus={{
        state: 'idle',
      }}
      mostRecentPrinterDiagnostic={{
        type: 'test-print',
        outcome: 'pass',
        timestamp: generatedAtTime.getTime(),
      }}
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="mock-election-package-hash"
    />
  );

  screen.getByText('VxScan Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(
    hasTextAcrossElements('Date: Saturday, January 1, 2022 at 12:00:00 AM AKST')
  );

  screen.getByText(/Example Primary Election/);

  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');

  screen.getByText('The scanner is connected.');

  screen.getByText('The printer is loaded with paper and ready to print.');

  screen.getByText('Test print successful, 1/1/2022, 12:00:00 AM');
});
