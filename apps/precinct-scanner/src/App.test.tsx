import React from 'react'
import fetchMock from 'fetch-mock'
import { promises as fs } from 'fs'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { fakeKiosk, fakeUsbDrive } from '@votingworks/test-utils'
import { join } from 'path'
import { electionSampleDefinition } from '@votingworks/fixtures'
import App from './App'

beforeEach(() => {
  jest.useFakeTimers()
})

test('app can load and configure from a usb stick', async () => {
  fetchMock.getOnce('/config/election', new Response('null'))
  fetchMock.get('/config/testMode', { testMode: true })
  const { getByText } = render(<App />)
  await waitFor(() => getByText('Loading Configuration…'))
  jest.advanceTimersByTime(1001)
  await waitFor(() => getByText('Precinct Scanner is Not Configured'))
  getByText('Insert USB Drive with configuration.')

  const kiosk = fakeKiosk()
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  window.kiosk = kiosk
  jest.advanceTimersByTime(2001)

  await waitFor(() =>
    getByText(
      'Error in configuration: No ballot package found on the inserted USB drive.'
    )
  )

  // Remove the USB
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([])
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText('Insert USB Drive with configuration.'))

  // Mock getFileSystemEntries returning an error
  kiosk.getFileSystemEntries = jest.fn().mockRejectedValueOnce('error')
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  jest.advanceTimersByTime(2001)
  await waitFor(() =>
    getByText(
      'Error in configuration: No ballot package found on the inserted USB drive.'
    )
  )

  // Remove the USB
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([])
  jest.advanceTimersByTime(2001)
  await waitFor(() => getByText('Insert USB Drive with configuration.'))

  const pathToFile = join(
    __dirname,
    '../test/fixtures/ballot-package-state-of-hamilton.zip'
  )
  kiosk.getFileSystemEntries = jest.fn().mockResolvedValue([
    {
      name: 'ballot-package.zip',
      path: pathToFile,
      type: 1,
    },
  ])
  kiosk.readFile = jest.fn().mockResolvedValue(await fs.readFile(pathToFile))

  fetchMock
    .patchOnce('/config/testMode', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .patchOnce('/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .post('/scan/hmpb/addTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .post('/scan/hmpb/doneTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .get('./config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    })

  // Reinsert USB now that fake zip file on it is setup
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  jest.advanceTimersByTime(2001)

  await waitFor(() =>
    getByText('Congratulations the precinct scanner is configured!')
  )

  expect(fetchMock.calls('/config/election', { method: 'PATCH' })).toHaveLength(
    1
  )
  expect(fetchMock.calls('/scan/hmpb/addTemplates')).toHaveLength(16)
  expect(fetchMock.calls('/scan/hmpb/doneTemplates')).toHaveLength(1)

  fetchMock.delete('./config/election', {
    body: '{"status": "ok"}',
    status: 200,
  })
  fireEvent.click(getByText('Unconfigure'))
  await waitFor(() =>
    expect(fetchMock.calls('./config/election', { method: 'DELETE' }))
  )
})
