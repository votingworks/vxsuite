import { render, screen } from '../test/react_testing_library';

import { TestMode } from './test_mode';

test('renders TestMode - legacy styling', () => {
  render(<TestMode />, {
    vxTheme: { sizeMode: 'legacy' },
  });
  screen.getByText('Test Ballot Mode');
});

test('renders TestMode - VVSG styling', () => {
  render(<TestMode />, {
    vxTheme: { sizeMode: 'l' },
  });
  screen.getByText('Test Ballot Mode');
});
