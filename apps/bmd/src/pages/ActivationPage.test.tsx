import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'

import ActivationPage from './ActivationPage'

it(`fetches the card data after 1 second`, async () => {
  jest.useFakeTimers()

  fetchMock.mockResponses(
    [JSON.stringify({}), { status: 200 }],
    [JSON.stringify({ card: 'VX.21.5R' }), { status: 200 }],
    ['', { status: 500 }]
  )

  const activateBallotMock = jest.fn()

  render(<Route path="/" component={ActivationPage} />, {
    activateBallot: activateBallotMock,
    route: '/',
  })

  expect(window.setInterval).toHaveBeenCalledTimes(1)

  jest.advanceTimersByTime(3000)

  expect(fetchMock.mock.calls.length).toEqual(3)
  expect(fetchMock.mock.calls).toEqual([
    ['/card/read'],
    ['/card/read'],
    ['/card/read'],
  ])

  jest.useRealTimers()

  // Put these at the end of the event loop so fetches can finish
  // I'm not super excited about this, wish I could deterministically say
  // "wait until the fetches finish", but not seeing how to do that well.
  window.setTimeout(() => {
    expect(activateBallotMock).toHaveBeenCalledTimes(1)
    expect(window.clearInterval).toHaveBeenCalledTimes(2)
    fetchMock.resetMocks()
  }, 0)
})
