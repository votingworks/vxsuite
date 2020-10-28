import fetchMock from 'fetch-mock'
import { electionSample } from '@votingworks/ballot-encoder'
import { get, patch } from './config'

test('GET /config', async () => {
  fetchMock.getOnce(
    '/config',
    JSON.stringify({ election: electionSample, testMode: true })
  )
  expect(await get()).toEqual({ election: electionSample, testMode: true })
})

test('PATCH /config', async () => {
  fetchMock.patchOnce('/config', JSON.stringify({ status: 'ok' }))
  await patch({})
})

test('PATCH /config fails', async () => {
  fetchMock.patchOnce(
    '/config',
    new Response(JSON.stringify({ status: 'error' }), { status: 400 })
  )
  await expect(patch({})).rejects.toThrowError(
    'failed with response status: 400'
  )
})

test('PATCH /config to delete election', async () => {
  fetchMock.patchOnce('/config', JSON.stringify({ status: 'ok' }))
  await patch({ election: null })
})
