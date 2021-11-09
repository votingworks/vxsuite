// This is a temporary test to be removed once SVG graphics are created.
import React from 'react';
import { render } from '@testing-library/react';
import { PlaceholderGraphic } from './graphics';

test('Renders Absolute top right', async () => {
  const { container } = render(<PlaceholderGraphic />);
  expect(container).toMatchSnapshot();
});
