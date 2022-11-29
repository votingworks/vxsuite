import React from 'react';
import { render } from '@testing-library/react';
import { Absolute } from './absolute';

test('Renders Absolute top right', () => {
  const { container } = render(<Absolute top right padded />);
  expect(container).toMatchSnapshot();
});

test('Renders Absolute bottom left', () => {
  const { container } = render(<Absolute bottom left />);
  expect(container).toMatchSnapshot();
});
