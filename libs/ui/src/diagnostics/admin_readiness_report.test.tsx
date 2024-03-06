import { hasTextAcrossElements } from '@votingworks/test-utils';
import { AdminReadinessReport } from './admin_readiness_report';
import { render, screen } from '../../test/react_testing_library';
import { MOCK_MARKER_INFO, MOCK_PRINTER_CONFIG } from './printer_section.test';

test('AdminReadinessReport', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <AdminReadinessReport
      batteryInfo={{
        level: 0.5,
        discharging: true,
      }}
      diskSpaceSummary={{
        total: 1000000000,
        available: 500000000,
        used: 500000000,
      }}
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
      generatedAtTime={generatedAtTime}
      machineId={machineId}
    />
  );
  expect(
    screen.getByText('VxAdmin Equipment Readiness Report')
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
  expect(screen.getByText('Ready to print')).toBeInTheDocument();
  expect(screen.getByText('Toner Level: 100%')).toBeInTheDocument();
  expect(
    screen.getByText('Test print successful, 1/1/2022, 12:00:00 AM')
  ).toBeInTheDocument();
});
