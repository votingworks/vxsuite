import React from 'react'
import { render } from '@testing-library/react'

import { Screen } from './Screen'

describe('renders Screen', () => {
  test('with defaults', async () => {
    const { container } = render(
      <Screen>
        <div>Hello</div> <div>World</div>
      </Screen>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  test('with with all non-default options', async () => {
    const { container } = render(
      <Screen white voterMode={false}>
        <div>Hello</div> <div>World</div>
      </Screen>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
