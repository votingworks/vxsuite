import { render, waitFor, fireEvent } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { BallotSheetInfo } from '../config/types'
import BallotEjectScreen from './BallotEjectScreen'

test('renders properly', async () => {
  const response: BallotSheetInfo = {
    front: {
      image: {
        url: '/front/url',
      },
    },
    back: {
      image: {
        url: '/back/url',
      },
    },
  }
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', response)

  const continueScanning = jest.fn()

  const { container, getByText } = render(
    <BallotEjectScreen continueScanning={continueScanning} />
  )

  await act(async () => {
    await waitFor(() => fetchMock.called)
  })

  expect(container).toMatchSnapshot()

  fireEvent.click(getByText!('Continue Scanning Batch'))
  expect(continueScanning).toHaveBeenCalledWith()

  continueScanning.mockClear()

  fireEvent.click(getByText!('Override'))
  expect(continueScanning).toHaveBeenCalledWith(true)
})
