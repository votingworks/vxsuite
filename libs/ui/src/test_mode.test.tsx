import React from 'react';
import { render } from '@testing-library/react';

import { TestMode } from './test_mode';

test('renders TestMode', () => {
  const { container } = render(<TestMode />);
  expect(container).toMatchSnapshot();
});
