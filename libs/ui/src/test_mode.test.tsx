import { render, screen } from '../test/react_testing_library';

import { TestMode } from './test_mode';

test('renders TestMode - VVSG styling', () => {
  const { container } = render(<TestMode />, {
    vxTheme: { sizeMode: 'l' },
  });
  screen.getByText('Test Ballot Mode');
  expect(container).toMatchSnapshot();
});
