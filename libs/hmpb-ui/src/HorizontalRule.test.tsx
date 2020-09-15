import { render } from '@testing-library/react'
import React from 'react'
import { HorizontalRule } from './HorizontalRule'

test('renders without children', () => {
  expect(render(<HorizontalRule />).container).toMatchInlineSnapshot(`
    <div>
      <p
        class="sc-AxjAm bSLtZl"
      />
    </div>
  `)
})

test('renders with children', () => {
  expect(render(<HorizontalRule>child</HorizontalRule>).container)
    .toMatchInlineSnapshot(`
    <div>
      <p
        class="sc-AxjAm jBQfEt"
      >
        child
      </p>
    </div>
  `)
})
