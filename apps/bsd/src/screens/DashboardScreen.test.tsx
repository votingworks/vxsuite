import { act, render, waitFor } from '@testing-library/react'
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
  const status: ScanStatusResponse = {
    batches: [],
    adjudication: noneLeftAdjudicationStatus,
  }
  const component = render(
    <Router history={createMemoryHistory()}>
      <DashboardScreen
        deleteBatch={deleteBatch}
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
  const status: ScanStatusResponse = {
    batches: [
      {
        id: 'a',
        count: 1,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        ballots: [{ id: 1, filename: '/tmp/img1.jpg' }],
      },
      {
        id: 'b',
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
  const status: ScanStatusResponse = {
    batches: [
      {
        id: 'a',
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
  const status: ScanStatusResponse = {
    batches: [
      {
        id: 'a',
        count: 1,
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        ballots: [{ id: 1, filename: '/tmp/img1.jpg' }],
      },
      {
        id: 'b',
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

  let deleteBatch1Resolve!: VoidFunction
  let deleteBatch2Reject!: (error: unknown) => void
  let deleteBatch2Resolve!: VoidFunction
  deleteBatch
    .mockResolvedValueOnce(
      new Promise<void>((resolve) => {
        deleteBatch1Resolve = resolve
      })
    )
    .mockResolvedValueOnce(
      new Promise<void>((_resolve, reject) => {
        deleteBatch2Reject = reject
      })
    )
    .mockResolvedValueOnce(
      new Promise<void>((resolve) => {
        deleteBatch2Resolve = resolve
      })
    )

  // Click delete & confirm.
  deleteBatch1Button.click()
  ;(await waitFor(() => component.findByText('Yes, Delete Batch'))).click()
  await component.findByText('Deleting…')
  expect(deleteBatch).toHaveBeenNthCalledWith(1, status.batches[0].id)
  act(() => deleteBatch1Resolve())
  await waitFor(() => !component.findByText('Delete batch a?'))

  // Click delete but cancel.
  deleteBatch2Button.click()
  ;(await waitFor(() => component.getByText('Cancel'))).click()
  expect(deleteBatch).not.toHaveBeenCalledWith(status.batches[1].id)

  // Click delete & confirm but fail.
  deleteBatch2Button.click()
  ;(await waitFor(() => component.getByText('Yes, Delete Batch'))).click()
  await component.findByText('Deleting…')
  expect(deleteBatch).toHaveBeenNthCalledWith(2, status.batches[1].id)
  act(() => deleteBatch2Reject(new Error('batch is a teapot')))
  ;(await waitFor(() => component.getByText('batch is a teapot'))).click()

  // Try again.
  ;(await waitFor(() => component.getByText('Yes, Delete Batch'))).click()
  act(() => deleteBatch2Resolve())
  await waitFor(() => !component.findByText('Delete batch b?'))
})
