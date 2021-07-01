import React from 'react'
import { render } from '@testing-library/react'

import { Loading } from './Loading'

describe('Renders Loading', () => {
  test('with defaults', () => {
    const { container } = render(<Loading />)
    expect(container.firstChild).toMatchSnapshot()
  })

  test('fullscreen with tag and label', () => {
    const { container } = render(
      <Loading isFullscreen as="p">
        Printing
      </Loading>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
