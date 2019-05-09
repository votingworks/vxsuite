// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components'
import 'react-testing-library/cleanup-after-each'
import JestFetchMock, { FetchMock, GlobalWithFetchMock } from 'jest-fetch-mock'

const customGlobal = global as GlobalWithFetchMock
customGlobal.fetch = JestFetchMock as FetchMock
customGlobal.fetchMock = customGlobal.fetch

// Supress "test was not wrapped in act()" Warning
// Remove when upgrading to react-dom@16.9.0
// Bug: https://github.com/facebook/react/pull/14853
// Fix: https://github.com/testing-library/react-testing-library/issues/281#issuecomment-480349256
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (/Warning.*not wrapped in act/.test(args[0])) {
      return
    }
    originalError.call(console, ...args)
  }
})
afterAll(() => {
  console.error = originalError
})
/* eslint-enable no-console, @typescript-eslint/no-explicit-any */
