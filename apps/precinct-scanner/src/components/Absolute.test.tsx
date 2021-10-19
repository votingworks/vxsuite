import React from 'react';
import { render } from '@testing-library/react';
import { Absolute } from './Absolute';

test('Renders Absolute top right', async () => {
  const { container } = render(<Absolute top right padded />);
  expect(container).toMatchSnapshot();
});

test('Renders Absolute bottom left', async () => {
  const { container } = render(<Absolute bottom left />);
  expect(container).toMatchSnapshot();
});
