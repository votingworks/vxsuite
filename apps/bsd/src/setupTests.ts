import fetchMock from 'fetch-mock'

beforeEach(() => {
  fetchMock.reset()
  fetchMock.mock()
})
