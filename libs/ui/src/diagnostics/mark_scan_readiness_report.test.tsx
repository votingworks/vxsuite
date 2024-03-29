import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MarkScanReadinessReport } from './mark_scan_readiness_report';
import { render, screen } from '../../test/react_testing_library';

test('MarkScanReadinessReport', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <MarkScanReadinessReport
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
      generatedAtTime={generatedAtTime}
      machineId={machineId}
    />
  );

  expect(screen.getByText('VxMarkScan Readiness Report')).toBeInTheDocument();
  expect(
    screen.getByText(hasTextAcrossElements('Machine ID: MOCK'))
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      hasTextAcrossElements(
        'Date: Saturday, January 1, 2022 at 12:00:00 AM AKST'
      )
    )
  ).toBeInTheDocument();

  screen.getByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Detected');
  screen.getByText(/Test passed/);
  screen.getByText('passed child');
});
