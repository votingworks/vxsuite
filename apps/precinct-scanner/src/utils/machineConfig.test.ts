import fetchMock from 'fetch-mock'
import machineConfigProvider from './machineConfig'

test('successful fetch from /machine-config', async () => {
  fetchMock.get('/machine-config', () =>
    JSON.stringify({ machineId: '1', codeVersion: '3.14' })
  )
  expect(await machineConfigProvider.get()).toEqual({
    machineId: '1',
    codeVersion: '3.14',
  })
})

test('failed fetch from /machine-config', async () => {
  fetchMock.get('/machine-config', {
    throws: new Error('fetch failed!'),
  })
  await expect(machineConfigProvider.get()).rejects.toThrowError(
    'fetch failed!'
  )
})
