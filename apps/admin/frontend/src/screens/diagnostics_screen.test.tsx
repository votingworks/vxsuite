import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PrinterConfig } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen, within, act } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { DiagnosticsScreen } from './diagnostics_screen';
import { TEST_PAGE_PRINT_DELAY_SECONDS } from '../components/print_diagnostic_button';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-06-22T12:00:00.000'),
  });
  apiMock = createApiMock();
  apiMock.expectGetUsbDriveStatus('mounted');
});

afterEach(() => {
  vi.useRealTimers();
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

test('battery state', async () => {
  apiMock.setPrinterStatus({ connected: false });
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
  });

  await expectTextWithIcon('Battery Level: 100%', 'square-check');
  await expectTextWithIcon(
    'Power Source: External Power Supply',
    'square-check'
  );

  apiMock.setBatteryInfo({
    level: 0.5,
    discharging: true,
  });

  await vi.runOnlyPendingTimersAsync();
  await expectTextWithIcon('Battery Level: 50%', 'square-check');
  await expectTextWithIcon('Power Source: Battery', 'circle-info');

  apiMock.setBatteryInfo({
    level: 0.05,
    discharging: true,
  });

  await vi.runOnlyPendingTimersAsync();
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
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
  });

  await expectTextWithIcon('No compatible printer detected', 'circle-info');

  apiMock.setPrinterStatus({
    connected: true,
    config: mockPrinterConfig,
  });
  await expectTextWithIcon('Connected', 'square-check');

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
  await expectTextWithIcon('Ready to print', 'square-check');
  await expectTextWithIcon('Toner Level: 83%', 'square-check');
  // rich status display tested in libs/ui

  // run through failed and passed print diagnostic
  await expectTextWithIcon('No test print on record', 'circle-info');

  apiMock.apiClient.printTestPage.expectCallWith().resolves();
  userEvent.click(screen.getButton('Print Test Page'));
  await screen.findByText('Printing Test Page');
  act(() => {
    vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000);
  });
  await screen.findByText('Test Page Printed');
  expect(screen.getButton('Confirm')).toBeDisabled();
  userEvent.click(screen.getByRole('radio', { name: /Fail/ }));
  expect(screen.getButton('Confirm')).toBeEnabled();
  apiMock.expectAddDiagnosticRecord({
    type: 'test-print',
    outcome: 'fail',
  });
  apiMock.expectGetMostRecentPrinterDiagnostic({
    type: 'test-print',
    outcome: 'fail',
    timestamp: new Date('2022-06-22T12:00:00.000').getTime(),
  });
  userEvent.click(screen.getButton('Confirm'));
  await screen.findByText('Test Print Failed');
  userEvent.click(screen.getButton('Close'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await expectTextWithIcon(
    'Test print failed, 6/22/2022, 12:00:00 PM',
    'triangle-exclamation'
  );

  apiMock.apiClient.printTestPage.expectCallWith().resolves();
  userEvent.click(screen.getButton('Print Test Page'));
  await screen.findByText('Printing Test Page');
  act(() => {
    vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000);
  });
  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByRole('radio', { name: /Pass/ }));
  apiMock.expectAddDiagnosticRecord({
    type: 'test-print',
    outcome: 'pass',
  });
  apiMock.expectGetMostRecentPrinterDiagnostic({
    type: 'test-print',
    outcome: 'pass',
    timestamp: new Date('2022-06-22T12:01:00.000').getTime(),
  });
  userEvent.click(screen.getButton('Confirm'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  await expectTextWithIcon(
    'Test print successful, 6/22/2022, 12:01:00 PM',
    'square-check'
  );
});

describe('disk space summary', () => {
  beforeEach(() => {
    apiMock.setPrinterStatus({ connected: false });
    apiMock.expectGetMostRecentPrinterDiagnostic();
  });

  test('normal disk space', async () => {
    apiMock.expectGetDiskSpaceSummary({
      available: 99.2 * 1_000_000,
      used: 0.08 * 1_000_000,
      total: 100 * 1_000_000,
    });
    renderInAppContext(<DiagnosticsScreen />, {
      apiMock,
    });

    await expectTextWithIcon(
      'Free Disk Space: 99% (99.2 GB / 100 GB)',
      'square-check'
    );
  });

  test('low disk space', async () => {
    apiMock.expectGetDiskSpaceSummary({
      available: 2.4 * 1_000_000,
      used: 97.6 * 1_000_000,
      total: 100 * 1_000_000,
    });
    renderInAppContext(<DiagnosticsScreen />, {
      apiMock,
    });

    await expectTextWithIcon(
      'Free Disk Space: 2% (2.4 GB / 100 GB)',
      'triangle-exclamation'
    );
  });
});

test('configuration info', async () => {
  apiMock.setPrinterStatus();
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
    electionDefinition: electionTwoPartyPrimaryDefinition,
  });

  await screen.findByText(/Example Primary Election/);
});

test('saving the readiness report', async () => {
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetDiskSpaceSummary();
  apiMock.expectGetMostRecentPrinterDiagnostic();
  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
  });

  userEvent.click(await screen.findButton('Save Readiness Report'));
  const modal = await screen.findByRole('alertdialog');
  apiMock.apiClient.saveReadinessReport
    .expectCallWith()
    .resolves(ok(['mock.pdf']));
  userEvent.click(within(modal).getByText('Save'));
});
