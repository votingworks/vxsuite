import { render } from '@testing-library/react'
import { createMemoryHistory } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { ScanStatusResponse } from '../config/types'
import DashboardScreen from './DashboardScreen'

const noneLeftAdjudicationStatus = {
  adjudicated: 0,
  remaining: 0,
}

test('null state', () => {
  const deleteBatch = jest.fn()
  const invalidateBatch = jest.fn()
  const status: ScanStatusResponse = {
    batches: [],
    adjudication: noneLeftAdjudicationStatus,
  }
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        invalidateBatch={invalidateBatch}
        isScanning={false}
        status={status}
        adjudicationStatus={noneLeftAdjudicationStatus}
      />
    </Router>
  )

  expect(component.baseElement.textContent).toMatch(
    /No ballots have been scanned/
  )
})

test('shows scanned ballot count', () => {
  const deleteBatch = jest.fn()
  const invalidateBatch = jest.fn()
  const status: ScanStatusResponse = {
    batches: [
      {
        id: 1,
        count: 1,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        ballots: [{ id: 1, filename: '/tmp/img1.jpg' }],
      },
      {
        id: 2,
        count: 3,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        ballots: [
          { id: 2, filename: '/tmp/img2.jpg' },
          { id: 3, filename: '/tmp/img3.jpg' },
          { id: 4, filename: '/tmp/img4.jpg' },
        ],
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
  }
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        invalidateBatch={invalidateBatch}
        isScanning={false}
        status={status}
        adjudicationStatus={noneLeftAdjudicationStatus}
      />
    </Router>
  )

  expect(component.baseElement.textContent).toMatch(
    /A total of 4 ballots have been scanned in 2 batches/
  )
})

test('shows whether a batch is scanning', () => {
  const deleteBatch = jest.fn()
  const invalidateBatch = jest.fn()
  const status: ScanStatusResponse = {
    batches: [
      {
        id: 1,
        count: 3,
        startedAt: new Date(0).toISOString(),
        ballots: [
          { id: 2, filename: '/tmp/img2.jpg' },
          { id: 3, filename: '/tmp/img3.jpg' },
          { id: 4, filename: '/tmp/img4.jpg' },
        ],
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
  }
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        invalidateBatch={invalidateBatch}
        isScanning
        status={status}
        adjudicationStatus={noneLeftAdjudicationStatus}
      />
    </Router>
  )

  expect(component.baseElement.textContent).toMatch(/Scanning…/)
})

test('allows deleting a batch', async () => {
  const deleteBatch = jest.fn()
  const invalidateBatch = jest.fn()
  const status: ScanStatusResponse = {
    batches: [
      {
        id: 1,
        count: 1,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        ballots: [{ id: 1, filename: '/tmp/img1.jpg' }],
      },
      {
        id: 2,
        count: 3,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        ballots: [
          { id: 2, filename: '/tmp/img2.jpg' },
          { id: 3, filename: '/tmp/img3.jpg' },
          { id: 4, filename: '/tmp/img4.jpg' },
        ],
      },
    ],
    adjudication: noneLeftAdjudicationStatus,
  }
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
        invalidateBatch={invalidateBatch}
        isScanning={false}
        status={status}
        adjudicationStatus={noneLeftAdjudicationStatus}
      />
    </Router>
  )

  expect(deleteBatch).not.toHaveBeenCalled()
  const [
    deleteBatch1Button,
    deleteBatch2Button,
  ] = component.getAllByText('Delete', { selector: 'button' })

  // Click delete & confirm.
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)
  deleteBatch1Button.click()
  expect(deleteBatch).toHaveBeenNthCalledWith(1, status.batches[0].id)

  // Click delete but cancel.
  jest.spyOn(window, 'confirm').mockReturnValueOnce(false)
  deleteBatch2Button.click()
  expect(deleteBatch).not.toHaveBeenCalledWith(status.batches[1].id)

  // Click delete & confirm.
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)
  deleteBatch2Button.click()
  expect(deleteBatch).toHaveBeenNthCalledWith(2, status.batches[1].id)
})
