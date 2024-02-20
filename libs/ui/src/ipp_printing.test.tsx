import {
  IppMarkerInfo,
  PrinterConfig,
  PrinterRichStatus,
  PrinterStatus,
} from '@votingworks/types';
import { render, screen, within } from '../test/react_testing_library';
import {
  PrinterStatusDisplay,
  parseHighestPriorityIppPrinterStateReason,
} from './ipp_printing';

const mockPrinterConfig: PrinterConfig = {
  label: '',
  vendorId: 0,
  productId: 0,
  baseDeviceUri: '',
  ppd: '',
  supportsIpp: true,
};

const mockMarkerInfo: IppMarkerInfo = {
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
    config: mockPrinterConfig,
    richStatus: {
      state: 'idle',
      stateReasons: [],
      markerInfos: [mockMarkerInfo],
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

async function expectTextWithIcon(text: string, icon: string) {
  const textElement = await screen.findByText(text);
  expect(
    within(textElement.closest('p')!)
      .getByRole('img', {
        hidden: true,
      })
      .getAttribute('data-icon')
  ).toEqual(icon);
}

describe('PrinterStatusDisplay status message', () => {
  test('displays disconnected', async () => {
    render(<PrinterStatusDisplay printerStatus={{ connected: false }} />);
    await expectTextWithIcon('No compatible printer detected', 'circle-info');
  });

  test('displays non-IPP printer connected', async () => {
    render(
      <PrinterStatusDisplay
        printerStatus={{
          connected: true,
          config: { ...mockPrinterConfig, supportsIpp: false },
        }}
      />
    );
    await expectTextWithIcon('Connected', 'circle-check');
  });

  test('displays IPP connected without status', async () => {
    render(
      <PrinterStatusDisplay
        printerStatus={{
          connected: true,
          config: mockPrinterConfig,
        }}
      />
    );
    await expectTextWithIcon('Connected', 'spinner');
  });

  test('idle', async () => {
    render(<PrinterStatusDisplay printerStatus={getMockPrinterStatus()} />);

    await expectTextWithIcon('Ready to print', 'circle-check');
  });

  test('sleep mode and low toner', async () => {
    render(
      <PrinterStatusDisplay
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
      <PrinterStatusDisplay
        printerStatus={getMockPrinterStatus({
          state: 'processing',
        })}
      />
    );

    await expectTextWithIcon('Printing', 'spinner');
  });

  test('while stopped without reason', async () => {
    render(
      <PrinterStatusDisplay
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
      <PrinterStatusDisplay
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
      <PrinterStatusDisplay
        printerStatus={getMockPrinterStatus({
          state: 'stopped',
          stateReasons: ['something-new-warning'],
        })}
      />
    );

    await expectTextWithIcon('Stopped - something-new', 'triangle-exclamation');
  });
});

describe('PrinterStatusDisplay marker info', () => {
  test('full marker info', async () => {
    render(<PrinterStatusDisplay printerStatus={getMockPrinterStatus()} />);
    await expectTextWithIcon('Toner Level: 100%', 'circle-check');
  });

  test('low toner', async () => {
    render(
      <PrinterStatusDisplay
        printerStatus={getMockPrinterStatus({
          markerInfos: [{ ...mockMarkerInfo, level: 2 }],
        })}
      />
    );
    await expectTextWithIcon('Toner Level: 2%', 'triangle-exclamation');
  });
});
