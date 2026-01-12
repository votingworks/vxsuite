import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import {
  PrintTestPageButton,
  TEST_PAGE_PRINT_DELAY_SECONDS,
} from './print_diagnostic_button';

let apiMock: ApiMock;

function renderButton() {
  return render(provideApi(apiMock, <PrintTestPageButton />));
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-03-23T11:23:00.000'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders print test page button', async () => {
  renderButton();

  await screen.findByRole('button', { name: 'Print Test Page' });
});

test('button is disabled when printer is not connected', async () => {
  apiMock.setPrinterStatus({ connected: false });
  renderButton();

  const button = await screen.findByRole('button', { name: 'Print Test Page' });
  expect(button).toBeDisabled();
});

test('button is enabled when printer is connected', async () => {
  renderButton();

  const button = await screen.findByRole('button', { name: 'Print Test Page' });
  expect(button).not.toBeDisabled();
});

test('shows printing modal when starting print', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  await screen.findByText('Printing Test Page');
});

test('shows verification modal after print delay', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  await screen.findByText('Printing Test Page');

  // Advance time past the print delay
  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  screen.getByText('Inspect the test page and select a test outcome:');
  screen.getByText('Pass');
  screen.getByText('Fail');
  screen.getByRole('button', { name: 'Confirm' });
  screen.getByRole('button', { name: 'Cancel' });
});

test('confirm button is disabled until outcome is selected', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  const confirmButton = screen.getByRole('button', { name: 'Confirm' });
  expect(confirmButton).toBeDisabled();

  // Select pass option
  userEvent.click(screen.getByText('Pass'));
  await waitFor(() => {
    expect(confirmButton).not.toBeDisabled();
  });
});

test('selecting pass and confirming records pass outcome', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  apiMock.expectAddDiagnosticRecord({
    type: 'test-print',
    outcome: 'pass',
  });
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByText('Pass'));
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  // Modal should close
  await waitFor(() => {
    expect(screen.queryByText('Test Page Printed')).not.toBeInTheDocument();
  });
});

test('selecting fail and confirming records fail outcome and shows failure modal', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  apiMock.expectAddDiagnosticRecord({
    type: 'test-print',
    outcome: 'fail',
  });
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByText('Fail'));
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  // Should show failure modal
  await screen.findByText('Test Print Failed');
  screen.getByText(
    /Please consult the printer manufacturer's documentation to troubleshoot/
  );
  screen.getByRole('button', { name: 'Close' });
});

test('closing failure modal returns to initial state', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  apiMock.expectAddDiagnosticRecord({
    type: 'test-print',
    outcome: 'fail',
  });
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByText('Fail'));
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await screen.findByText('Test Print Failed');
  userEvent.click(screen.getByRole('button', { name: 'Close' }));

  // Modal should close and button should be visible again
  await waitFor(() => {
    expect(screen.queryByText('Test Print Failed')).not.toBeInTheDocument();
  });
  screen.getByRole('button', { name: 'Print Test Page' });
});

test('canceling verification modal returns to initial state', async () => {
  apiMock.mockApiClient.printTestPage.expectCallWith().resolves();
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  // Modal should close
  await waitFor(() => {
    expect(screen.queryByText('Test Page Printed')).not.toBeInTheDocument();
  });
  screen.getByRole('button', { name: 'Print Test Page' });
});
