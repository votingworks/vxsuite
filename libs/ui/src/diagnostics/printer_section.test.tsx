import {
  IppMarkerInfo,
  PrinterConfig,
  PrinterRichStatus,
  PrinterStatus,
} from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import {
  PrinterSection,
  parseHighestPriorityIppPrinterStateReason,
} from './printer_section';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';

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

function getMockPrinterStatus(
  richStatus: Partial<PrinterRichStatus> = {}
): PrinterStatus {
  return {
    connected: true,
    config: MOCK_PRINTER_CONFIG,
    richStatus: {
      state: 'idle',
      stateReasons: [],
      markerInfos: [MOCK_MARKER_INFO],
      ...richStatus,
    },
  };
}

describe('parseHighestPriorityIppPrinterStateReason', () => {
  test('ignores "none"', () => {
    expect(parseHighestPriorityIppPrinterStateReason(['none'])).toEqual(
      undefined
    );
  });

  test('shows error over warning', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-warning',
        'media-needed-error',
      ])
    ).toEqual('media-needed');
  });

  test('shows warning over report', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-report',
        'media-needed-warning',
      ])
    ).toEqual('media-needed');
  });

  test('shows first of same level', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-warning',
        'media-needed-warning',
      ])
    ).toEqual('toner-low');
  });

  test('ignores unparseable reasons', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-report',
        'media?-what-media?-warning',
      ])
    ).toEqual('toner-low');
  });
});

describe('PrinterSection status message', () => {
  test('displays disconnected', async () => {
    render(<PrinterSection printerStatus={{ connected: false }} />);
    await expectTextWithIcon('No compatible printer detected', 'circle-info');
  });

  test('displays non-IPP printer connected', async () => {
    render(
      <PrinterSection
        printerStatus={{
          connected: true,
          config: { ...MOCK_PRINTER_CONFIG, supportsIpp: false },
        }}
      />
    );
    await expectTextWithIcon('Connected', 'square-check');
  });

  test('displays IPP connected without status', async () => {
    render(
      <PrinterSection
        printerStatus={{
          connected: true,
          config: MOCK_PRINTER_CONFIG,
        }}
      />
    );
    await expectTextWithIcon('Connected', 'square-check');
  });

  test('idle', async () => {
    render(<PrinterSection printerStatus={getMockPrinterStatus()} />);

    await expectTextWithIcon('Ready to print', 'square-check');
  });

  test('sleep mode and low toner', async () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus({
          stateReasons: ['sleep-mode'],
        })}
      />
    );

    await expectTextWithIcon(
      'Sleep mode is on - Press any button on the printer to wake it.',
      'circle-info'
    );
  });

  test('while printing', async () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus({
          state: 'processing',
        })}
      />
    );

    await expectTextWithIcon('Printing', 'spinner');
  });

  test('while stopped without reason', async () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus({
          state: 'stopped',
          stateReasons: [],
        })}
      />
    );

    await expectTextWithIcon('Stopped', 'triangle-exclamation');
  });

  test('while stopped with reason', async () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus({
          state: 'stopped',
          stateReasons: ['media-needed-warning'],
        })}
      />
    );

    await expectTextWithIcon(
      'Stopped - The printer is out of paper. Add paper to the printer.',
      'triangle-exclamation'
    );
  });

  test('shows unknown reasons', async () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus({
          state: 'stopped',
          stateReasons: ['something-new-warning'],
        })}
      />
    );

    await expectTextWithIcon('Stopped - something-new', 'triangle-exclamation');
  });
});

describe('PrinterSection marker info', () => {
  test('full marker info', async () => {
    render(<PrinterSection printerStatus={getMockPrinterStatus()} />);
    await expectTextWithIcon('Toner Level: 100%', 'square-check');
  });

  test('low toner', async () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus({
          markerInfos: [{ ...MOCK_MARKER_INFO, level: 2 }],
        })}
      />
    );
    await expectTextWithIcon('Toner Level: 2%', 'triangle-exclamation');
  });
});

describe('PrinterSection diagnostic message', () => {
  test('no diagnostics', () => {
    render(<PrinterSection printerStatus={getMockPrinterStatus()} />);
    screen.getByText('No test print on record');
  });

  const timestamp = new Date('2024-01-01T00:00:00').getTime();

  test('successful diagnostic', () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus()}
        mostRecentPrinterDiagnostic={{
          type: 'test-print',
          outcome: 'pass',
          timestamp,
        }}
      />
    );
    screen.getByText('Test print successful, 1/1/2024, 12:00:00 AM');
  });

  test('failed diagnostic', () => {
    render(
      <PrinterSection
        printerStatus={getMockPrinterStatus()}
        mostRecentPrinterDiagnostic={{
          type: 'test-print',
          outcome: 'fail',
          timestamp,
        }}
      />
    );
    screen.getByText('Test print failed, 1/1/2024, 12:00:00 AM');
  });
});
