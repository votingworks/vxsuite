import { test } from 'vitest';
import { render, screen } from '../../test/react_testing_library.js';
import { PrintPage } from './print_page.js';

test('renders the printing message', () => {
  render(<PrintPage />);
  screen.getByText('Printing Your Ballot...');
});
