import { hasTextAcrossElements } from '@votingworks/test-utils';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { IppMarkerInfo, PrinterConfig } from '@votingworks/types';
import { AdminReadinessReport } from './admin_readiness_report';
import { render, screen } from '../../test/react_testing_library';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

export const MOCK_PRINTER_CONFIG: PrinterConfig = {
  label: '',
  vendorId: 0,
  productId: 0,
  baseDeviceUri: '',
  ppd: '',
  supportsIpp: true,
};

export const MOCK_MARKER_INFO: IppMarkerInfo = {
  color: '#000000',
  highLevel: 100,
  level: 100,
  lowLevel: 2,
  name: 'black cartridge',
  type: 'toner-cartridge',
};

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
      electionDefinition={electionTwoPartyPrimaryDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={generatedAtTime}
      machineId={machineId}
    />
  );
  screen.getByText('VxAdmin Readiness Report');
  screen.getByText(hasTextAcrossElements('Machine ID: MOCK'));
  screen.getByText(
    hasTextAcrossElements('Date: Saturday, January 1, 2022 at 12:00:00 AM AKST')
  );
  screen.getByText(/Example Primary Election/);
  screen.getByText('Battery Level: 50%');
  screen.getByText('Power Source: Battery');
  screen.getByText('Ready to print');
  screen.getByText('Toner Level: 100%');
  screen.getByText('Test print successful, 1/1/2022, 12:00:00 AM');
});
