import React from 'react';
import { render } from '@testing-library/react';

import { TestMode } from './test_mode';

test('renders TestMode', () => {
  const { container } = render(<TestMode />);
  expect(container).toMatchInlineSnapshot(`
    <div>
      <div
        class="sc-bdvvaa hoKchV"
      >
        <div>
          Machine is in Testing Mode
        </div>
      </div>
    </div>
  `);
});
