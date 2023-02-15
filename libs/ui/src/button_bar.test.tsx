import React from 'react';
import { render } from '../test/react_testing_library';

import { ButtonBar } from './button_bar';

test('renders ButtonBar', () => {
  const { container } = render(<ButtonBar>foo</ButtonBar>);
  expect(container.firstChild).toMatchSnapshot();
});
