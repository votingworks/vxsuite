import { expect, test, vi } from 'vitest';
import { userEvent } from './user_event.js';
import { render, screen } from '../test/react_testing_library.js';
import { PrintJobFailedModal } from './print_job_failed_modal.js';

test('single ballot, with a reason', () => {
  const onClose = vi.fn();
  render(
    <PrintJobFailedModal
      multipleBallotsAttempted={false}
      reason="Printer is out of paper."
      onClose={onClose}
    />
  );

  screen.getByRole('heading', { name: 'Ballot Not Printed' });
  screen.getByText('The ballot was not sent to the printer.');
  screen.getByText('Printer is out of paper.');

  userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('multiple ballots, without a reason', () => {
  render(<PrintJobFailedModal multipleBallotsAttempted onClose={vi.fn()} />);

  screen.getByRole('heading', { name: 'Ballots Not Printed' });
  screen.getByText('The ballots were not sent to the printer.');
});
