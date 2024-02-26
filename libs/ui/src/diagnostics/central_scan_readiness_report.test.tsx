import { CentralScanReadinessReportContents } from '.';
import { render, screen } from '../../test/react_testing_library';

test('CentralScanReadinessReportContents', () => {
  render(
    <CentralScanReadinessReportContents
      batteryInfo={{
        level: 0.5,
        discharging: true,
      }}
      diskSpaceSummary={{
        total: 1_000_000_000,
        available: 500_000_000,
        used: 500_000_000,
      }}
    />
  );

  expect(screen.getByText('Battery Level: 50%')).toBeInTheDocument();
  expect(screen.getByText('Power Source: Battery')).toBeInTheDocument();
  expect(
    screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)')
  ).toBeInTheDocument();
});
