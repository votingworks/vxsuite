import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within, act } from '../../test/react_testing_library.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';
import { PrintButton } from './print_button.js';
import {
  getPrinterStatus,
  PRINTER_STATUS_POLLING_INTERVAL_MS,
} from '../api.js';

vi.useFakeTimers({
  shouldAdvanceTime: true,
});

// In the app, PrinterAlertWrapper is the single printer status poller and
// PrintButton just subscribes to the shared query. Since these tests render
// the button on its own, this stands in for PrinterAlertWrapper's polling.
function PrinterStatusPoller() {
  getPrinterStatus.useQuery({
    refetchInterval: PRINTER_STATUS_POLLING_INTERVAL_MS,
  });
  return null;
}

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('happy path flow', async () => {
  const mockPrint = vi.fn();
  apiMock.setPrinterStatus({
    connected: true,
  });
  renderInAppContext(
    <React.Fragment>
      <PrinterStatusPoller />
      <PrintButton print={mockPrint}>Print</PrintButton>
    </React.Fragment>,
    { apiMock }
  );
  await vi.waitFor(() => expect(screen.getButton('Print')).not.toBeDisabled());

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  userEvent.click(screen.getButton('Print'));
  await within(screen.getByRole('alertdialog')).findByText('Printing');
  expect(mockPrint).toHaveBeenCalledTimes(1);
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('prompts user to attach printer if not connected', async () => {
  const mockPrint = vi.fn();
  apiMock.setPrinterStatus({
    connected: false,
  });
  renderInAppContext(
    <React.Fragment>
      <PrinterStatusPoller />
      <PrintButton print={mockPrint}>Print</PrintButton>
    </React.Fragment>,
    { apiMock }
  );
  await vi.waitFor(() => expect(screen.getButton('Print')).not.toBeDisabled());

  // try printing and give up (press "Close")
  userEvent.click(screen.getButton('Print'));
  let modal = screen.getByRole('alertdialog');
  within(modal).getByText('The printer is not connected.');
  expect(mockPrint).not.toHaveBeenCalled();
  expect(within(modal).getButton('Continue')).toBeDisabled();
  userEvent.click(within(modal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // try printing and connect printer (press "Continue")
  userEvent.click(screen.getButton('Print'));
  modal = screen.getByRole('alertdialog');
  expect(within(modal).getButton('Continue')).toBeDisabled();
  apiMock.setPrinterStatus({
    connected: true,
  });
  await vi.waitFor(() => {
    expect(within(modal).getButton('Continue')).not.toBeDisabled();
  });
  userEvent.click(within(modal).getButton('Continue'));
  await screen.findByText('Printing');
  expect(mockPrint).toHaveBeenCalledTimes(1);
});

test('has option to not show the default progress modal', async () => {
  const mockPrint = vi.fn();
  apiMock.setPrinterStatus({
    connected: true,
  });
  renderInAppContext(
    <React.Fragment>
      <PrinterStatusPoller />
      <PrintButton print={mockPrint} useDefaultProgressModal={false}>
        Print
      </PrintButton>
    </React.Fragment>,
    { apiMock }
  );
  await vi.waitFor(() => expect(screen.getButton('Print')).not.toBeDisabled());

  userEvent.click(screen.getButton('Print'));
  expect(mockPrint).toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});
