// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components';
import '@testing-library/jest-dom/extend-expect';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'util';
import { configure } from '@testing-library/react';
import {
  expectAllPrintsAsserted,
  fakePrintElement,
  fakePrintElementWhenReady,
} from '@votingworks/test-utils';

configure({ asyncUtilTimeout: 5_000 });

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original = jest.requireActual('@votingworks/ui');
  return {
    ...original,
    printElementWhenReady: fakePrintElementWhenReady,
    printElement: fakePrintElement,
  };
});

beforeEach(() => {
  // react-gamepad calls this function which does not exist in JSDOM
  globalThis.navigator.getGamepads = jest.fn(() => []);
  globalThis.print = jest.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
});

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
    // eslint-disable-next-line @typescript-eslint/require-await
    speak: jest.fn(async (utterance) =>
      utterance.onend?.(new SpeechSynthesisEvent('end', { utterance }))
    ),
    speaking: false,
  };
}

function mockSpeechSynthesis() {
  globalThis.speechSynthesis = makeSpeechSynthesisDouble();
  globalThis.SpeechSynthesisUtterance = jest
    .fn()
    .mockImplementation((text) => ({ text }));
  globalThis.SpeechSynthesisEvent = jest.fn();
}

beforeEach(() => {
  mockSpeechSynthesis();
  fetchMock.mock();
});

afterEach(() => {
  expectAllPrintsAsserted();
  fetchMock.restore();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
