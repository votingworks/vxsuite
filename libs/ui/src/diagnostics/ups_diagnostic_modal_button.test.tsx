import { vi, test, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/react_testing_library';
import { UpsDiagnosticModalButton } from './ups_diagnostic_modal_button';

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

  userEvent.click(screen.getButton('Test Uninterruptible Power Supply'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).toBeInTheDocument()
  );
  userEvent.click(screen.getButton('Yes'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(logOutcome).toHaveBeenCalledWith({ outcome: 'pass' });

  // Re-open the modal to test the "No" path:
  userEvent.click(screen.getButton('Test Uninterruptible Power Supply'));
  userEvent.click(screen.getButton('No'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  expect(logOutcome).toHaveBeenCalledWith({ outcome: 'fail' });
});
