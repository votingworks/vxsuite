// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components'
import crypto from 'crypto'
import fetchMock from 'fetch-mock'
import { TextDecoder, TextEncoder } from 'util'
import { mockOf } from '../test/testUtils'

// globalThis.crypto is not defined in JSDOM
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues(arr: Parameters<typeof crypto['randomFillSync']>[0]) {
      return crypto.randomFillSync(arr)
    },
  },
})

// react-gamepad calls this function which does not exist in JSDOM
globalThis.navigator.getGamepads = jest.fn(() => [])

globalThis.print = jest.fn(() => {
  throw new Error('globalThis.print() should never be called')
})

const printMock = mockOf(globalThis.print)

function mockSpeechSynthesis() {
  globalThis.speechSynthesis = makeSpeechSynthesisDouble()
  globalThis.SpeechSynthesisUtterance = jest
    .fn()
    .mockImplementation(text => ({ text }))
  globalThis.SpeechSynthesisEvent = jest.fn()
}

function makeSpeechSynthesisDouble(): typeof speechSynthesis {
  return {
    addEventListener: jest.fn(),
    cancel: jest.fn(),
    dispatchEvent: jest.fn(),
    getVoices: jest.fn().mockImplementation(() => []),
    onvoiceschanged: jest.fn(),
    pause: jest.fn(),
    paused: false,
    pending: false,
    removeEventListener: jest.fn(),
    resume: jest.fn(),
    speak: jest.fn(async utterance =>
      utterance.onend?.(new SpeechSynthesisEvent('end', { utterance }))
    ),
    speaking: false,
  }
}

beforeEach(() => {
  mockSpeechSynthesis()
  fetchMock.mock()
})

afterEach(() => {
  fetchMock.restore()
  printMock.mockClear()
})

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder
