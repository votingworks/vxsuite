import React from 'react';
import { render } from '@testing-library/react';

import { Select } from './Select';

describe('renders Select', () => {
  test('large', async () => {
    const { container } = render(<Select large />);
    expect(container.firstChild).toMatchSnapshot();
  });
  test('small', async () => {
    const { container } = render(<Select small />);
    expect(container.firstChild).toMatchSnapshot();
  });
  test('fullWidth', async () => {
    const { container } = render(<Select fullWidth />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
