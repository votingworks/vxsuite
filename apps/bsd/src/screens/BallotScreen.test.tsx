import React from 'react'
import { render, RenderResult, waitFor } from '@testing-library/react'
import { Router, Route } from 'react-router-dom'
import { createMemoryHistory } from 'history'
import fetchMock from 'fetch-mock'
import { act } from 'react-dom/test-utils'
import { BallotMark } from '@votingworks/hmpb-interpreter'
import { electionSample, CandidateContest } from '@votingworks/ballot-encoder'
import BallotScreen from './BallotScreen'

test('renders an image of the ballot', async () => {
  fetchMock.getOnce('/scan/batch/1/ballot/2', {
    id: 2,
    filename: '/tmp/img2.jpg',
    cvr: { _precinctId: 'PCT2', _ballotStyleId: 'BS2', _ballotId: 'cba' },
  })

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
  expect(imageElement.src).toMatch('/scan/batch/1/ballot/2/image')
})

test('renders ballot marks for each mark', async () => {
  const contest = electionSample.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const marks: BallotMark[] = [
    {
      type: 'candidate',
      score: 0.78,
      bounds: { x: 0, y: 0, width: 50, height: 25 },
      contest,
      target: {
        bounds: { x: 5, y: 5, width: 10, height: 5 },
        inner: { x: 5, y: 5, width: 10, height: 5 },
      },
      option: contest.candidates[0],
    },
  ]
  fetchMock.getOnce('/scan/batch/1/ballot/2', {
    id: 2,
    filename: '/tmp/img2.jpg',
    cvr: { _precinctId: 'PCT2', _ballotStyleId: 'BS2', _ballotId: 'cba' },
    marks: {
      ballotSize: { width: 1500, height: 2500 },
      marks,
    },
  })

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

  const markElements = component.getAllByTitle(/Mark/)
  expect(markElements).toHaveLength(1)
  expect(markElements[0].style.getPropertyValue('left')).toEqual('0px')
  expect(markElements[0].style.getPropertyValue('top')).toEqual('0px')
  expect(markElements[0].style.getPropertyValue('width')).toEqual('50px')
  expect(markElements[0].style.getPropertyValue('height')).toEqual('25px')
})
