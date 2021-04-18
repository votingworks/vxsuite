import fetchMock from 'fetch-mock'
import jestFetchMock from 'jest-fetch-mock'

beforeEach(() => {
  jestFetchMock.enableMocks()
  fetchMock.reset()
  fetchMock.mock()
})
