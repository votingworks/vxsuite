import { MarkScanReadinessReportContents } from './mark_scan_readiness_report';
import { render, screen } from '../../test/react_testing_library';

test('MarkScanReadinessReportContents', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  render(
    <MarkScanReadinessReportContents
      batteryInfo={{
        level: 0.5,
        discharging: true,
      }}
      diskSpaceSummary={{
        total: 1000000000,
        available: 500000000,
        used: 500000000,
      }}
      mostRecentAccessibleControllerDiagnostic={{
        type: 'mark-scan-accessible-controller',
        outcome: 'pass',
        timestamp: generatedAtTime.getTime(),
      }}
      isAccessibleControllerInputDetected
      accessibleControllerSectionChildren={<p>passed child</p>}
    />
  );
  screen.getByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Detected');
  screen.getByText(/Test passed/);
  screen.getByText('passed child');
});
