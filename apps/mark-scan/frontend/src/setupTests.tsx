// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import 'jest-styled-components';
import '@testing-library/jest-dom/extend-expect';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'util';
import {
  expectTestToEndWithAllPrintsAsserted,
  fakePrintElement,
  fakePrintElementToPdf,
  fakePrintElementWhenReady,
} from '@votingworks/test-utils';
import { configure } from '../test/react_testing_library';
import './polyfills';

configure({ asyncUtilTimeout: 5_000 });

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original = jest.requireActual('@votingworks/ui');
  return {
    ...original,
    printElementWhenReady: fakePrintElementWhenReady,
    printElement: fakePrintElement,
    printElementToPdf: fakePrintElementToPdf,
    useAudioControls: jest.fn(),
  };
});

beforeEach(() => {
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
    speak: jest.fn(
      // eslint-disable-next-line @typescript-eslint/require-await
      async (utterance) =>
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
  expectTestToEndWithAllPrintsAsserted();
  fetchMock.restore();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
