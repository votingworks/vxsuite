// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components'
import crypto from 'crypto'
import fetchMock from 'fetch-mock'

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

// Capture Event Listeners
const eventListenerCallbacksDictionary: any = {} // eslint-disable-line @typescript-eslint/no-explicit-any
window.addEventListener = jest.fn((event, cb) => {
  eventListenerCallbacksDictionary[event] = cb
})
window.print = jest.fn(() => {
  eventListenerCallbacksDictionary.afterprint &&
    eventListenerCallbacksDictionary.afterprint()
})
// TODO: add callback for window.resize like above
// TODO: add callback for window.keydown like above
