// This is a temporary test to be removed once SVG graphics are created.
import React from 'react';
import { render } from '../../test/react_testing_library';
import { PlaceholderGraphic } from './graphics';

test('Renders Absolute top right', () => {
  const { container } = render(<PlaceholderGraphic />);
  expect(container).toMatchSnapshot();
});
