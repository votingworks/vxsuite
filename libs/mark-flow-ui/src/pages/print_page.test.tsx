import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '../../test/react_testing_library.js';
import { PrintPage } from './print_page.js';

test('calls print method', async () => {
  const print = vi.fn();
  render(<PrintPage print={print} />);
  await waitFor(() => {
    expect(print).toHaveBeenCalledTimes(1);
  });
  screen.getByText('Printing Your Ballot...');
});
