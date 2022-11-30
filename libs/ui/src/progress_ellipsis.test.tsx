import React from 'react';
import { render } from '@testing-library/react';

import { ProgressEllipsis } from './progress_ellipsis';

test('renders ProgressEllipsis', () => {
  const { container } = render(<ProgressEllipsis />);
  expect(container).toMatchInlineSnapshot(`
    .c0 {
      margin-left: -1.4em;
      text-align: center;
      white-space: nowrap;
    }

    .c0::before,
    .c0::after {
      display: inline-block;
      width: 0;
      overflow: hidden;
      vertical-align: bottom;
      text-align: left;
      content: '…';
      -webkit-animation: loadingEllipsis steps(4,end) 2s infinite;
      animation: loadingEllipsis steps(4,end) 2s infinite;
    }

    .c0::before {
      color: transparent;
    }

    <div>
      <span
        class="c0"
      />
    </div>
  `);
});
