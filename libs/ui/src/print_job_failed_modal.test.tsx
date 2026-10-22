import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library.js';
import { PrintJobFailedModal } from './print_job_failed_modal.js';

test('single ballot, with a reason', async () => {
  const onClose = vi.fn();
  render(
    <PrintJobFailedModal
      multipleBallotsAttempted={false}
      reason="Printer is out of paper."
      onClose={onClose}
    />
  );

  screen.getByRole('heading', { name: 'Ballot Not Printed' });
  screen.getByText('There was a problem with the printer.');
  screen.getByText('Printer is out of paper.');

  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('multiple ballots, without a reason', () => {
  render(<PrintJobFailedModal multipleBallotsAttempted onClose={vi.fn()} />);

  screen.getByRole('heading', { name: 'Ballots Not Printed' });
  screen.getByText('There was a problem with the printer.');
});
