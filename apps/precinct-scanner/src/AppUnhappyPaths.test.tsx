import React from 'react'
import fetchMock from 'fetch-mock'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import { GetTestModeConfigResponse } from '@votingworks/types/api/module-scan'
import App from './App'

test('when module scan doesnt respond shows loading screen', async () => {
  fetchMock.get('/config/election', { status: 404 })
  const spy = jest.spyOn(console, 'error').mockReturnValue()

  const { getByText } = render(<App />)
  await waitFor(() => getByText('Loading Configuration…'))
  expect(spy).toHaveBeenCalledWith('failed to initialize:', expect.any(Error))
})

test('module-scan fails to unconfigure', async () => {
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.getOnce('/config/testMode', getTestModeResponseBody)
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
