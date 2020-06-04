import fetchMock from 'fetch-mock'
import { electionSample } from '@votingworks/ballot-encoder'
import { delete as del, get, put } from './election'

beforeEach(() => {
  fetchMock.reset()
})

test('GET /config/election', async () => {
  fetchMock.getOnce('/config/election', JSON.stringify(electionSample))
  expect(await get()).toEqual(electionSample)
})

test('PUT /config/election', async () => {
  fetchMock.putOnce('/config/election', JSON.stringify({ status: 'ok' }))
  await put(electionSample)
})

test('PUT /config/election fails', async () => {
  fetchMock.putOnce(
    '/config/election',
    new Response(JSON.stringify({ status: 'error' }), { status: 400 })
  )
  await expect(put(electionSample)).rejects.toThrowError(
    'failed with response status: 400'
  )
})

test('DELETE /config/election', async () => {
  fetchMock.deleteOnce('/config/election', JSON.stringify({ status: 'ok' }))
  await del()
})

test('DELETE /config/election fails', async () => {
  fetchMock.deleteOnce(
    '/config/election',
    new Response(JSON.stringify({ status: 'error' }), { status: 500 })
  )
  await expect(del()).rejects.toThrowError('failed with response status: 500')
})
