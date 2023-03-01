import React from 'react';
import { render } from '../../test/react_testing_library';

import { NoPrint } from './no_print';

it('renders NoPrint', () => {
  const { container } = render(<NoPrint>foo</NoPrint>);
  expect(container.firstChild).toMatchSnapshot();
});
