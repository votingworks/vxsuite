import React from 'react';
import { render } from '@testing-library/react';

import { Select } from './select';

describe('renders Select', () => {
  test('large', () => {
    const { container } = render(<Select large />);
    expect(container.firstChild).toMatchSnapshot();
  });
  test('small', () => {
    const { container } = render(<Select small />);
    expect(container.firstChild).toMatchSnapshot();
  });
  test('fullWidth', () => {
    const { container } = render(<Select fullWidth />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
