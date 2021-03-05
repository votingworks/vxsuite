import React from 'react'

import {
  render,
  fireEvent,
  getByText as domGetByText,
  waitFor,
} from '@testing-library/react'
import { electionSample } from '@votingworks/fixtures'
import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'

import SetMarkThresholdsModal from './SetMarkThresholdsModal'

test('renders warning message before allowing overrides to be set', () => {
  const closeFn = jest.fn()
  const { getByText } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={undefined}
        setMarkThresholdOverrides={jest.fn()}
      />
    </Router>
  )
  getByText('Override Mark Thresholds')
  getByText(/WARNING: Do not proceed/)
  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()
})

test('renders reset modal when overrides are set', async () => {
  const closeFn = jest.fn()
  const setMarkThresholdOverrides = jest.fn().mockResolvedValueOnce('')
  const { getByText } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={{ definite: 0.32, marginal: 0.24 }}
        setMarkThresholdOverrides={setMarkThresholdOverrides}
      />
    </Router>
  )
  getByText('Reset Mark Thresholds')
  const currentThresholds = getByText('Current Thresholds')
  domGetByText(currentThresholds, /Definite: 0.32/)
  domGetByText(currentThresholds, /Marginal: 0.24/)

  const defaultThresholds = getByText('Default Thresholds')
  domGetByText(defaultThresholds, /Definite: 0.25/)
  domGetByText(defaultThresholds, /Marginal: 0.17/)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalled()

  fireEvent.click(getByText('Reset Thresholds'))
  expect(setMarkThresholdOverrides).toHaveBeenCalledWith(undefined)
  await waitFor(() => {
    expect(closeFn).toHaveBeenCalledTimes(2)
  })
})
test('reset modal displays errors appropriately', async () => {
  const closeFn = jest.fn()
  const setMarkThresholdOverrides = jest
    .fn()
    .mockRejectedValueOnce(new Error('Hakuna Matata'))
  const { getByText } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={{ definite: 0.32, marginal: 0.24 }}
        setMarkThresholdOverrides={setMarkThresholdOverrides}
      />
    </Router>
  )
  getByText('Reset Mark Thresholds')
  fireEvent.click(getByText('Reset Thresholds'))
  expect(setMarkThresholdOverrides).toHaveBeenCalledWith(undefined)
  await waitFor(() => {
    getByText('Error')
  })
  getByText(/Hakuna Matata/)
  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalledTimes(1)
})

test('allows users to set thresholds properly', async () => {
  const closeFn = jest.fn()
  const setThresholds = jest.fn()
  const { getByText, getByTestId } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={undefined}
        setMarkThresholdOverrides={setThresholds}
      />
    </Router>
  )
  getByText('Override Mark Thresholds')
  getByText(/WARNING: Do not proceed/)
  fireEvent.click(getByText('Proceed to Override Thresholds'))

  const definiteInput = getByTestId('definite-text-input').closest('input')!
  expect(definiteInput.value).toBe('0.25')
  fireEvent.change(definiteInput, { target: { value: '0.12' } })
  expect(definiteInput.value).toBe('0.12')

  const marginalInput = getByTestId('marginal-text-input').closest('input')!
  expect(marginalInput.value).toBe('0.17')
  fireEvent.change(marginalInput, { target: { value: '0.21' } })
  expect(marginalInput.value).toBe('0.21')

  fireEvent.click(getByText('Override Thresholds'))
  expect(setThresholds).toHaveBeenCalledWith({ definite: 0.12, marginal: 0.21 })
  await waitFor(() => {
    expect(closeFn).toHaveBeenCalledTimes(1)
  })
})

test('setting thresholds renders an error if given a non number', async () => {
  const closeFn = jest.fn()
  const setThresholds = jest.fn()
  const { getByText, getByTestId } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={undefined}
        setMarkThresholdOverrides={setThresholds}
      />
    </Router>
  )
  getByText('Override Mark Thresholds')
  getByText(/WARNING: Do not proceed/)
  fireEvent.click(getByText('Proceed to Override Thresholds'))

  const definiteInput = getByTestId('definite-text-input').closest('input')!
  fireEvent.change(definiteInput, { target: { value: 'giraffes' } })
  expect(definiteInput.value).toBe('giraffes')

  fireEvent.click(getByText('Override Thresholds'))
  getByText('Error')
  getByText(/Inputted definite threshold invalid: giraffes./)
  expect(setThresholds).toHaveBeenCalledTimes(0)
  expect(closeFn).toHaveBeenCalledTimes(0)
})

test('setting thresholds renders an error if given a number greater than 1', async () => {
  const closeFn = jest.fn()
  const setThresholds = jest.fn()
  const { getByText, getByTestId } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={undefined}
        setMarkThresholdOverrides={setThresholds}
      />
    </Router>
  )
  getByText('Override Mark Thresholds')
  getByText(/WARNING: Do not proceed/)
  fireEvent.click(getByText('Proceed to Override Thresholds'))

  const definiteInput = getByTestId('definite-text-input').closest('input')!
  fireEvent.change(definiteInput, { target: { value: '314' } })
  expect(definiteInput.value).toBe('314')

  fireEvent.click(getByText('Override Thresholds'))
  getByText('Error')
  getByText(/Inputted definite threshold invalid: 314./)
  expect(setThresholds).toHaveBeenCalledTimes(0)
  expect(closeFn).toHaveBeenCalledTimes(0)
})

test('setting thresholds renders an error if saving throws an error', async () => {
  const closeFn = jest.fn()
  const setThresholds = jest
    .fn()
    .mockRejectedValueOnce(new Error('Hakuna Matata'))
  const { getByText } = render(
    <Router history={createMemoryHistory()}>
      <SetMarkThresholdsModal
        onClose={closeFn}
        election={electionSample}
        markThresholdOverrides={undefined}
        setMarkThresholdOverrides={setThresholds}
      />
    </Router>
  )
  getByText('Override Mark Thresholds')
  getByText(/WARNING: Do not proceed/)
  fireEvent.click(getByText('Proceed to Override Thresholds'))

  fireEvent.click(getByText('Override Thresholds'))
  await waitFor(() => {
    getByText('Error')
  })
  getByText(/Hakuna Matata/)
  expect(setThresholds).toHaveBeenCalledTimes(1)
  expect(closeFn).toHaveBeenCalledTimes(0)

  fireEvent.click(getByText('Close'))
  expect(closeFn).toHaveBeenCalledTimes(1)
})
