import { render, screen, waitFor } from '../../test/react_testing_library';
import { PrintPage } from './print_page';

test('calls print method', async () => {
  const print = jest.fn();
  render(<PrintPage print={print} />);
  await waitFor(() => {
    expect(print).toHaveBeenCalledTimes(1);
  });
  screen.getByText('Printing Your Official Ballot...');
});
