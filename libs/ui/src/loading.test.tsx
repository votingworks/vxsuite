import React from 'react';
import { render } from '@testing-library/react';

import { Loading } from './loading';

test('Renders Loading with defaults', () => {
  const { container } = render(<Loading />);
  expect(container.firstChild).toMatchSnapshot();
});

test('Renders Loading fullscreen with tag and label', () => {
  const { container } = render(
    <Loading isFullscreen as="p">
      Printing
    </Loading>
  );
  expect(container.firstChild).toMatchSnapshot();
});
