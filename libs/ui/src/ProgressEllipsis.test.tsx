import React from 'react'
import { render } from '@testing-library/react'

import ProgressEllipsis from './ProgressEllipsis'

it('renders ProgressEllipsis', () => {
  const { container } = render(<ProgressEllipsis />)
  expect(container).toMatchInlineSnapshot(`
    <div>
      <span
        class="sc-bdvvaa etEPtU"
      />
    </div>
  `)
})
