import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import CastBallotPage from './CastBallotPage'

it('renders CastBallotPage', () => {
  const { container } = render(<Route path="/" component={CastBallotPage} />, {
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})
