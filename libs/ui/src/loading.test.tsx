import React from 'react';
import { render, screen } from '@testing-library/react';

import { Loading } from './loading';

test('Renders Loading with defaults', () => {
  const { container } = render(<Loading />);
  screen.getByText('Loading');
  expect(container.firstChild).toMatchSnapshot();
});

test('Renders Loading fullscreen with tag and label', () => {
  const { container } = render(
    <Loading isFullscreen as="p">
      Printing
    </Loading>
  );
  screen.getByText('Printing');
  expect(container.firstChild).toMatchSnapshot();
});
