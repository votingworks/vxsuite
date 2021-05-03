import fetchMock from 'fetch-mock'
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures'
import * as config from './config'

test('GET /config/election', async () => {
  fetchMock.getOnce('/config/election', testElectionDefinition)
  expect(await config.getElectionDefinition()).toEqual(testElectionDefinition)
})

test('PATCH /config/election', async () => {
  fetchMock.patchOnce('/config/election', JSON.stringify({ status: 'ok' }))
  await config.setElection(testElectionDefinition.electionData)
})

test('PATCH /config/election fails', async () => {
  fetchMock.patchOnce(
    '/config/election',
    new Response(JSON.stringify({ status: 'error', error: 'bad election!' }), {
      status: 400,
    })
  )
  await expect(
    config.setElection(testElectionDefinition.electionData)
  ).rejects.toThrowError('PATCH /config/election failed: bad election!')
})

test('DELETE /config/election to delete election', async () => {
  fetchMock.deleteOnce('/config/election', JSON.stringify({ status: 'ok' }))
  await config.setElection(undefined)
})

test('DELETE /config/election to delete election with bad API response', async () => {
  fetchMock.deleteOnce('/config/election', JSON.stringify({ status: 'not-ok' }))
  expect(async () => await config.setElection(undefined)).rejects.toThrow(
    /DELETE/
  )
})

test('GET /config/testMode', async () => {
  fetchMock.getOnce('/config/testMode', { testMode: true })
  expect(await config.getTestMode()).toEqual(true)

  fetchMock.getOnce(
    '/config/testMode',
    { testMode: false },
    { overwriteRoutes: true }
  )
  expect(await config.getTestMode()).toEqual(false)
})

test('PATCH /config/testMode', async () => {
  fetchMock.patchOnce('/config/testMode', JSON.stringify({ status: 'ok' }))
  await config.setTestMode(true)

  expect(fetchMock.calls('/config/testMode', { method: 'PATCH' })).toHaveLength(
    1
  )
})
