import fetchMock from 'fetch-mock'
import machineIdProvider from './machineId'

test('successful fetch from /machine-id', async () => {
  fetchMock.get('/machine-id', () => JSON.stringify({ machineId: '1' }))
  expect(await machineIdProvider.get()).toEqual('1')
})

test('failed fetch from /machine-id', () => {
  fetchMock.get('/machine-id', {
    throws: new Error('fetch failed!'),
  })
  expect(machineIdProvider.get()).rejects.toThrowError('fetch failed!')
})
