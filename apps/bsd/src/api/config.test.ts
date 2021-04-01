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
