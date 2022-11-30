import React from 'react';
import { render } from '@testing-library/react';

import { TestMode } from './test_mode';

test('renders TestMode', () => {
  const { container } = render(<TestMode />);
  expect(container).toMatchInlineSnapshot(`
    .c0 {
      border-bottom: 4px solid #333333;
      background-image: linear-gradient( 135deg, #ff8c00 21.43%, #333333 21.43%, #333333 50%, #ff8c00 50%, #ff8c00 71.43%, #333333 71.43%, #333333 100% );
      background-size: 98.99px 98.99px;
      width: 100%;
    }

    .c0 > div {
      margin: 0.5rem 0;
      background: #ff8c00;
      padding: 0.25rem 2rem;
      text-align: center;
      color: #333333;
      font-size: 2rem;
      font-weight: 900;
    }

    <div>
      <div
        class="c0"
      >
        <div>
          Machine is in Testing Mode
        </div>
      </div>
    </div>
  `);
});
