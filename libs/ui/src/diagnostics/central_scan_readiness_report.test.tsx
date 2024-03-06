import { hasTextAcrossElements } from '@votingworks/test-utils';
import { CentralScanReadinessReport } from '.';
import { render, screen } from '../../test/react_testing_library';

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
    />
  );

  expect(
    screen.getByText('VxCentralScan Equipment Readiness Report')
  ).toBeInTheDocument();
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

  expect(screen.getByText('Battery Level: 50%')).toBeInTheDocument();
  expect(screen.getByText('Power Source: Battery')).toBeInTheDocument();
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');

  expect(screen.getByText('Connected')).toBeInTheDocument();
});
