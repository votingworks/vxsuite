import fetchMock from 'fetch-mock'
import fetchJSON from './fetchJSON'

test('passes the URL through as-is to fetch', async () => {
  fetchMock.getOnce((url) => {
    expect(url).toEqual('/example')
    return true
  }, {})

  await fetchJSON('/example')
})

test('adds "Accept: application/json" by default', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(opts.headers).toEqual({ Accept: 'application/json' })
    return true
  }, {})

  await fetchJSON('/example')
})

test('allows overriding Accept header', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(opts.headers).toEqual({ Accept: 'x-custom-json' })
    return true
  }, {})

  await fetchJSON('/example', { headers: { Accept: 'x-custom-json' } })
})

test('preserves custom headers', async () => {
  fetchMock.getOnce((url, opts) => {
    expect(opts.headers).toEqual(expect.objectContaining({ 'X-Custom': '123' }))
    return true
  }, {})

  await fetchJSON('/example', { headers: { 'X-Custom': '123' } })
})

test('throws on non-ok response', async () => {
  fetchMock.getOnce('/example', { status: 400 })
  await expect(fetchJSON('/example')).rejects.toThrowError(
    'fetch response is not ok'
  )
})

test('interprets the response as JSON', async () => {
  fetchMock.getOnce('/example', '{ "status": "ok" }')
  expect(await fetchJSON('/example')).toEqual({ status: 'ok' })
})
