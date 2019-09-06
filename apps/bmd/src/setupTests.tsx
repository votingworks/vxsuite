// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components'
import crypto from 'crypto'
import fetchMock from 'fetch-mock'
import { mockOf } from '../test/testUtils'

fetchMock.get('/machine-id', () => JSON.stringify({ machineId: '1' }))

// window.crypto is not defined in JSDOM
// TODO: consider https://github.com/jsdom/jsdom/issues/1612#issuecomment-454040272
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: number[]) => crypto.randomBytes(arr.length),
  },
})

// react-gamepad calls this function which does not exist in JSDOM
window.navigator.getGamepads = jest.fn(() => [])

window.print = jest.fn(() => {
  throw new Error('window.print() should never be called')
})

const printMock = mockOf(window.print)

afterEach(() => {
  fetchMock.restore()
  printMock.mockClear()
})
