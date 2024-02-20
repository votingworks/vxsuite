import userEvent from '@testing-library/user-event';
import { PrinterConfig } from '@votingworks/types';
import { screen, within, act } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { HardwareDiagnosticsScreen } from './hardware_diagnostics_screen';
import { hackActuallyCleanUpReactModal } from '../../test/react_modal_cleanup';
import { TEST_PAGE_PRINT_DELAY_SECONDS } from '../components/print_diagnostic_button';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2022-06-22T00:00:00.000Z'));
  apiMock = createApiMock();
});

afterEach(() => {
  jest.useRealTimers();
  apiMock.assertComplete();
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

test('battery state ', async () => {
  apiMock.setPrinterStatus({ connected: false });
  apiMock.expectGetDiagnosticsRecords([]);
  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await expectTextWithIcon('Battery Level: 100%', 'circle-check');
  await expectTextWithIcon(
    'Power Source: External Power Supply',
    'circle-check'
  );

  apiMock.setBatteryInfo({
    level: 0.5,
    discharging: true,
  });

  await expectTextWithIcon('Battery Level: 50%', 'circle-check');
  await expectTextWithIcon('Power Source: Battery', 'circle-info');

  apiMock.setBatteryInfo({
    level: 0.05,
    discharging: true,
  });

  await expectTextWithIcon('Battery Level: 5%', 'triangle-exclamation');
  await expectTextWithIcon('Power Source: Battery', 'circle-info');
});

const mockPrinterConfig: PrinterConfig = {
  label: 'mock',
  vendorId: 0,
  productId: 0,
  baseDeviceUri: 'mock',
  ppd: 'mock',
  supportsIpp: true,
};

test('displays printer state and allows diagnostic', async () => {
  apiMock.setPrinterStatus({ connected: false });
  apiMock.expectGetDiagnosticsRecords([]);
  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await expectTextWithIcon('No compatible printer detected', 'circle-info');

  apiMock.setPrinterStatus({
    connected: true,
    config: mockPrinterConfig,
  });
  await expectTextWithIcon('Connected', 'spinner');

  apiMock.setPrinterStatus({
    connected: true,
    config: mockPrinterConfig,
    richStatus: {
      state: 'idle',
      stateReasons: [],
      markerInfos: [
        {
          name: 'black cartridge',
          color: '#000000',
          type: 'toner-cartridge',
          lowLevel: 2,
          highLevel: 100,
          level: 83,
        },
      ],
    },
  });
  await expectTextWithIcon('Ready to print', 'circle-check');
  await expectTextWithIcon('Toner Level: 83%', 'circle-check');
  // rich status display tested in libs/ui

  // run through failed and passed print diagnostic
  await expectTextWithIcon('No test print on record', 'circle-info');

  apiMock.apiClient.printTestPage.expectCallWith().resolves();
  userEvent.click(screen.getButton('Print Test Page'));
  await screen.findByText('Printing Test Page');
  act(() => {
    jest.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000);
  });
  await screen.findByText('Test Page Printed');
  expect(screen.getButton('Confirm')).toBeDisabled();
  userEvent.click(screen.getByRole('radio', { name: /Fail/ }));
  expect(screen.getButton('Confirm')).toBeEnabled();
  apiMock.expectAddDiagnosticRecord({
    hardware: 'printer',
    outcome: 'fail',
  });
  apiMock.expectGetDiagnosticsRecords([
    {
      hardware: 'printer',
      outcome: 'fail',
      timestamp: new Date('2022-06-22T12:00:00.000Z').getTime(),
    },
  ]);
  userEvent.click(screen.getButton('Confirm'));
  await screen.findByText('Test Print Failed');
  userEvent.click(screen.getButton('Close'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await hackActuallyCleanUpReactModal();
  await expectTextWithIcon(
    'Test print failed, 6/22/2022, 12:00:00 PM',
    'triangle-exclamation'
  );

  apiMock.apiClient.printTestPage.expectCallWith().resolves();
  userEvent.click(screen.getButton('Print Test Page'));
  await screen.findByText('Printing Test Page');
  act(() => {
    jest.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000);
  });
  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByRole('radio', { name: /Pass/ }));
  apiMock.expectAddDiagnosticRecord({
    hardware: 'printer',
    outcome: 'pass',
  });
  apiMock.expectGetDiagnosticsRecords([
    {
      hardware: 'printer',
      outcome: 'fail',
      timestamp: new Date('2022-06-22T12:00:00.000Z').getTime(),
    },
    {
      hardware: 'printer',
      outcome: 'pass',
      timestamp: new Date('2022-06-22T12:01:00.000Z').getTime(),
    },
  ]);
  userEvent.click(screen.getButton('Confirm'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await expectTextWithIcon(
    'Test print successful, 6/22/2022, 12:01:00 PM',
    'circle-check'
  );
});
