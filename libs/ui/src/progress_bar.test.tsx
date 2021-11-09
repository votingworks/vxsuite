import React from 'react';
import { render } from '@testing-library/react';

import { ProgressBar } from './progress_bar';

it('renders ProgressBar with defaults', async () => {
  const { container } = render(<ProgressBar />);
  expect(container.firstChild).toMatchSnapshot();
});
