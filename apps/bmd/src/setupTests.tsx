// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components'
import crypto from 'crypto'
import fetchMock from 'fetch-mock'
import { TextDecoder, TextEncoder } from 'util'
import { mockOf } from '../test/testUtils'

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

function mockSpeechSynthesis() {
  const w = window as {
    speechSynthesis: typeof speechSynthesis
    SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance
    SpeechSynthesisEvent: typeof SpeechSynthesisEvent
  }

  w.speechSynthesis = makeSpeechSynthesisDouble()
  w.SpeechSynthesisUtterance = jest.fn().mockImplementation(text => ({ text }))
  w.SpeechSynthesisEvent = jest.fn()
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

/* eslint-disable @typescript-eslint/no-explicit-any */
;(global as any).TextDecoder = TextDecoder
;(global as any).TextEncoder = TextEncoder
/* eslint-enable @typescript-eslint/no-explicit-any */
