import React from 'react'
import { render } from '@testing-library/react'

import Loading from './Loading'

it('renders default', () => {
  const { container } = render(<Loading />)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders fullscreen with tag and label', () => {
  const { container } = render(
    <Loading isFullscreen as="p">
      Printing
    </Loading>
  )
  expect(container.firstChild).toMatchSnapshot()
})
