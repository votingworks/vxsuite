import { render } from '@testing-library/react'
import React from 'react'
import { WriteInLine } from './WriteInLine'

test('renders with a label', () => {
  expect(render(<WriteInLine label="Hello World" />).container)
    .toMatchInlineSnapshot(`
    <div>
      <span
        class="sc-AxjAm grfyG"
        data-write-in-line="true"
      >
        Hello World
      </span>
    </div>
  `)
})
