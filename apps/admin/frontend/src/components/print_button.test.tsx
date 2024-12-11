import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { waitFor, screen, within, act } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { PrintButton } from './print_button';

vi.useFakeTimers();

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
  renderInAppContext(<PrintButton print={mockPrint}>Print</PrintButton>, {
    apiMock,
  });
  await waitFor(() => expect(screen.getButton('Print')).not.toBeDisabled());

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  userEvent.click(screen.getButton('Print'));
  await within(screen.getByRole('alertdialog')).findByText('Printing');
  expect(mockPrint).toHaveBeenCalledTimes(1);
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('prompts user to attach printer if not connected', async () => {
  const mockPrint = vi.fn();
  apiMock.setPrinterStatus({
    connected: false,
  });
  renderInAppContext(<PrintButton print={mockPrint}>Print</PrintButton>, {
    apiMock,
  });
  await waitFor(() => expect(screen.getButton('Print')).not.toBeDisabled());

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
  await waitFor(() => {
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
    <PrintButton print={mockPrint} useDefaultProgressModal={false}>
      Print
    </PrintButton>,
    { apiMock }
  );
  await waitFor(() => expect(screen.getButton('Print')).not.toBeDisabled());

  userEvent.click(screen.getButton('Print'));
  expect(mockPrint).toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
});
