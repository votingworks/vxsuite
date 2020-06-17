import { render, RenderResult, waitFor } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { createMemoryHistory } from 'history'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { Route, Router } from 'react-router-dom'
import BatchScreen from './BatchScreen'

test('redirects to the root if no batch ID is found', async () => {
  const history = createMemoryHistory({ initialEntries: ['/weird/path'] })

  act(() => {
    render(
      <Router history={history}>
        <BatchScreen />
      </Router>
    )
  })

  await waitFor(() => {
    expect(history.location.pathname).toEqual('/')
  })
})

test('renders a table with all ballots', async () => {
  fetchMock.getOnce('/scan/batch/1', [
    {
      id: 1,
      filename: '/tmp/img1.jpg',
      cvr: { _precinctId: 'PCT1', _ballotStyleId: 'BS1', _ballotId: 'abc' },
    },
    {
      id: 2,
      filename: '/tmp/img2.jpg',
      cvr: { _precinctId: 'PCT2', _ballotStyleId: 'BS2', _ballotId: 'cba' },
    },
  ])

  let component!: RenderResult

  await act(async () => {
    component = render(
      <Router history={createMemoryHistory({ initialEntries: ['/batch/1'] })}>
        <Route path="/batch/:batchId">
          <BatchScreen />
        </Route>
      </Router>
    )
  })

  await waitFor(() => {
    expect(component.baseElement.textContent).toMatch(/PCT1/)
    expect(component.baseElement.textContent).toMatch(/PCT2/)
    expect(component.baseElement.textContent).toMatch(/BS1/)
    expect(component.baseElement.textContent).toMatch(/BS2/)
  })
})

test('allows navigating to a ballot page', async () => {
  fetchMock.getOnce('/scan/batch/1', [
    {
      id: 2,
      filename: '/tmp/img2.jpg',
      cvr: { _precinctId: 'PCT2', _ballotStyleId: 'BS2', _ballotId: 'cba' },
    },
  ])

  const history = createMemoryHistory({ initialEntries: ['/batch/1'] })
  let component!: RenderResult

  await act(async () => {
    component = render(
      <Router history={history}>
        <Route path="/batch/:batchId">
          <BatchScreen />
        </Route>
      </Router>
    )
  })

  act(() => {
    component.getByText('View').click()
  })

  await waitFor(() => {
    expect(history.location.pathname).toEqual('/batch/1/ballot/2')
  })
})
