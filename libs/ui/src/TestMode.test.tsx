import React from 'react'
import { render } from '@testing-library/react'

import { TestMode } from './TestMode'

describe('renders TestMode', () => {
  test('as nothing when not in test mode', async () => {
    const { container } = render(<TestMode isLiveMode />)
    expect(container).toMatchInlineSnapshot(`<div />`)
  })

  test('with testing banner in test mode', () => {
    const { getByText, container } = render(<TestMode isLiveMode={false} />)
    getByText('Testing Mode')
    expect(container).toMatchInlineSnapshot(`
      <div>
        <p
          class="sc-bdvvaa sc-hKwCoD hqNiYo dRhqIc"
        >
          Testing Mode
        </p>
      </div>
    `)
  })
})
