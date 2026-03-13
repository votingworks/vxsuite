import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/react_testing_library';
import {
  PrintTestPageButton,
  TEST_PAGE_PRINT_DELAY_SECONDS,
} from './print_test_page_button';

const printTestPage = vi.fn();
const logTestPrintOutcome = vi.fn();

function renderButton(isPrinterConnected = true) {
  return render(
    <PrintTestPageButton
      isPrinterConnected={isPrinterConnected}
      printTestPage={printTestPage}
      logTestPrintOutcome={logTestPrintOutcome}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-03-23T11:23:00.000'),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

test('renders print test page button', async () => {
  renderButton();

  await screen.findByRole('button', { name: 'Print Test Page' });
});

test('button is disabled when printer is not connected', async () => {
  renderButton(false);

  const button = await screen.findByRole('button', { name: 'Print Test Page' });
  expect(button).toBeDisabled();
});

test('button is enabled when printer is connected', async () => {
  renderButton();

  const button = await screen.findByRole('button', { name: 'Print Test Page' });
  expect(button).not.toBeDisabled();
});

test('shows printing modal when starting print', async () => {
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  await screen.findByText('Printing Test Page');
  expect(printTestPage).toHaveBeenCalledOnce();
});

test('shows verification modal after print delay', async () => {
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  await screen.findByText('Printing Test Page');

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  screen.getByText('Inspect the test page and select a test outcome:');
  screen.getByText('Pass');
  screen.getByText('Fail');
  screen.getByRole('button', { name: 'Confirm' });
  screen.getByRole('button', { name: 'Cancel' });
});

test('confirm button is disabled until outcome is selected', async () => {
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  const confirmButton = screen.getByRole('button', { name: 'Confirm' });
  expect(confirmButton).toBeDisabled();

  userEvent.click(screen.getByText('Pass'));
  await waitFor(() => {
    expect(confirmButton).not.toBeDisabled();
  });
});

test('selecting pass and confirming logs pass outcome', async () => {
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByText('Pass'));
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() => {
    expect(screen.queryByText('Test Page Printed')).not.toBeInTheDocument();
  });
  expect(logTestPrintOutcome).toHaveBeenCalledWith({ outcome: 'pass' });
});

test('selecting fail and confirming logs fail outcome and shows failure modal', async () => {
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByText('Fail'));
  userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await screen.findByText('Test Print Failed');
  screen.getByText(
    /Please consult the printer manufacturer's documentation to troubleshoot/
  );
  screen.getByRole('button', { name: 'Close' });
  expect(logTestPrintOutcome).toHaveBeenCalledWith({ outcome: 'fail' });
});

test('closing failure modal returns to initial state', async () => {
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

  await waitFor(() => {
    expect(screen.queryByText('Test Print Failed')).not.toBeInTheDocument();
  });
  screen.getByRole('button', { name: 'Print Test Page' });
});

test('canceling verification modal returns to initial state', async () => {
  renderButton();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print Test Page' })
  );

  vi.advanceTimersByTime(TEST_PAGE_PRINT_DELAY_SECONDS * 1000 + 100);

  await screen.findByText('Test Page Printed');
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await waitFor(() => {
    expect(screen.queryByText('Test Page Printed')).not.toBeInTheDocument();
  });
  screen.getByRole('button', { name: 'Print Test Page' });
});
