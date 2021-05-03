import React from 'react'
import fetchMock from 'fetch-mock'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import App from './App'

test('when module scan doesnt respond shows loading screen', async () => {
  fetchMock.getOnce('/config/election', { status: 404 })
  const spy = jest.spyOn(console, 'error').mockReturnValue()

  const { getByText } = render(<App />)
  await waitFor(() => getByText('Loading Configuration…'))
  expect(spy).toHaveBeenCalledWith(
    'failed to initialize:',
    new Error('fetch response is not ok')
  )
})

test('module-scan fails to unconfigure', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.getOnce('/config/testMode', { testMode: true })
  fetchMock.deleteOnce('/config/election', { status: 404 })
  const spy = jest.spyOn(console, 'error').mockReturnValue()

  const { getByText } = render(<App />)
  await waitFor(() => fireEvent.click(getByText('Unconfigure')))
  expect(spy).toHaveBeenCalledWith(
    'failed unconfigureServer()',
    new Error(
      'invalid json response body at /config/election reason: Unexpected end of JSON input'
    )
  )
})
