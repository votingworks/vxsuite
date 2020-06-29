import { render, RenderResult, waitFor } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { createMemoryHistory } from 'history'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { Route, Router } from 'react-router-dom'
import { GetBallotResponse } from '../config/types'
import BallotScreen from './BallotScreen'

test('renders an image of the ballot', async () => {
  const response: GetBallotResponse = {
    ballot: {
      image: { url: '/scan/hmpb/ballot/2/image', width: 850, height: 1100 },
      url: '/scan/hmpb/ballot/2',
    },
    contests: [],
    marks: {},
  }
  fetchMock.getOnce('/scan/hmpb/ballot/2', response)

  let component!: RenderResult

  await act(async () => {
    component = render(
      <Router
        history={createMemoryHistory({ initialEntries: ['/batch/1/ballot/2'] })}
      >
        <Route path="/batch/:batchId/ballot/:ballotId">
          <BallotScreen />
        </Route>
      </Router>
    )

    await waitFor(() => fetchMock.called)
  })

  const imageElement = component.getByAltText(
    'Scanned Ballot'
  ) as HTMLImageElement
  expect(imageElement.src).toMatch('/scan/hmpb/ballot/2/image')
})

test('renders ballot options for each contest option', async () => {
  const response: GetBallotResponse = {
    ballot: {
      image: { url: '/scan/hmpb/ballot/2/image', width: 800, height: 1000 },
      url: '/scan/hmpb/ballot/2',
    },
    contests: [
      {
        id: 'contest-1',
        title: 'Contest',
        bounds: { x: 0, y: 0, width: 250, height: 400 },
        options: [
          {
            id: 'option-1',
            type: 'candidate',
            name: 'Candidate #1',
            bounds: { x: 0, y: 50, width: 250, height: 100 },
          },
        ],
      },
    ],
    marks: {},
  }
  fetchMock.getOnce('/scan/hmpb/ballot/2', response)

  let component!: RenderResult

  await act(async () => {
    component = render(
      <Router
        history={createMemoryHistory({ initialEntries: ['/batch/1/ballot/2'] })}
      >
        <Route path="/batch/:batchId/ballot/:ballotId">
          <BallotScreen />
        </Route>
      </Router>
    )

    await waitFor(() => fetchMock.called)
  })

  const markElements = component.getAllByTitle(/Candidate #1/)
  expect(markElements).toHaveLength(1)
  const style = window.getComputedStyle(markElements[0])
  expect(style.getPropertyValue('left')).toEqual('0px')
  expect(style.getPropertyValue('top')).toEqual('50px')
  expect(style.getPropertyValue('width')).toEqual('250px')
  expect(style.getPropertyValue('height')).toEqual('100px')
})

test('renders an error message on failure to fetch', async () => {
  fetchMock.getOnce('/scan/hmpb/ballot/2', 500)

  const history = createMemoryHistory({ initialEntries: ['/batch/1/ballot/2'] })
  let component!: RenderResult

  await act(async () => {
    component = render(
      <Router history={history}>
        <Route path="/batch/:batchId/ballot/:ballotId">
          <BallotScreen />
        </Route>
      </Router>
    )
  })

  component.getByText('An error occurred')
})
