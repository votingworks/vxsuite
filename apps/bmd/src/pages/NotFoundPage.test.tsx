import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import NotFoundPage from './NotFoundPage'

it(`renders NotFoundPage`, () => {
  const { container } = render(<Route path="/" component={NotFoundPage} />, {
    route: '/foobar-not-found-path',
  })
  expect(container.firstChild).toMatchSnapshot()
})
