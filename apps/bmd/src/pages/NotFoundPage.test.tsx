import React from 'react'
import { Route } from 'react-router-dom'
import { fireEvent } from 'react-testing-library'

import { render } from '../../test/testUtils'

import NotFoundPage from './NotFoundPage'

it(`renders NotFoundPage`, () => {
  const resetBallot = jest.fn()
  const { container, getByText } = render(
    <Route path="/" component={NotFoundPage} />,
    {
      resetBallot,
      route: '/foobar-not-found-path',
    }
  )
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(getByText('Start Over'))
  expect(resetBallot).toHaveBeenCalled()
})
