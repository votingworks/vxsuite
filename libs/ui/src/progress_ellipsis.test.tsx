import React from 'react';
import { render } from '@testing-library/react';

import { ProgressEllipsis } from './progress_ellipsis';

test('renders ProgressEllipsis', () => {
  const { container } = render(<ProgressEllipsis />);
  expect(container).toMatchInlineSnapshot(`
    <div>
      <span
        class="sc-bdvvaa etEPtU"
      />
    </div>
  `);
});
