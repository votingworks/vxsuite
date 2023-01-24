import React from 'react';
import { render } from '@testing-library/react';

import { AppBase } from './app_base';

test('renders AppBase', () => {
  const { container } = render(
    <AppBase>
      <div>foo</div>
    </AppBase>
  );

  expect(container.firstChild).toContainHTML('<div>foo</div>');
});
