import { vi, test, expect } from 'vitest';
import { userEvent } from '../user_event.js';
import { render, screen, waitFor } from '../../test/react_testing_library.js';
import { UpsDiagnosticModalButton } from './ups_diagnostic_modal_button.js';

vi.mock('../utils/use_sound');

test('shows modal', () => {
  render(<UpsDiagnosticModalButton isLoading={false} logOutcome={vi.fn()} />);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('calls logOutcome & closes modal on user confirmation', async () => {
  const logOutcome = vi.fn();
  render(
    <UpsDiagnosticModalButton isLoading={false} logOutcome={logOutcome} />
  );

  await userEvent.click(screen.getButton('Test Uninterruptible Power Supply'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).toBeInTheDocument()
  );
  await userEvent.click(screen.getButton('Yes'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(logOutcome).toHaveBeenCalledWith({ outcome: 'pass' });

  // Re-open the modal to test the "No" path:
  await userEvent.click(screen.getButton('Test Uninterruptible Power Supply'));
  await userEvent.click(screen.getButton('No'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(logOutcome).toHaveBeenCalledWith({ outcome: 'fail' });
});
