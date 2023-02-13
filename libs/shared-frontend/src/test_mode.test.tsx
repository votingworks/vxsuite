import React from 'react';
import { render, screen } from '@testing-library/react';

import { TestMode } from './test_mode';

test('renders TestMode', () => {
  const { container } = render(<TestMode />);
  screen.getByText('Machine is in Testing Mode');
  expect(container).toMatchSnapshot();
});
