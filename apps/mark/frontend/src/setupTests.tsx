// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'node:util';
import { BooleanEnvironmentVariableName as Feature } from '@votingworks/utils';
import { cleanup, configure } from '../test/react_testing_library';
import './polyfills';

expect.extend(matchers);
configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  // [TODO] Remove after full migration of mark-flow-ui.
  process.env[Feature.ENABLE_POLLING_PLACES] = 'TRUE';

  globalThis.print = vi.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
  cleanup();
});

beforeEach(() => {
  fetchMock.mock();
});

afterEach(() => {
  fetchMock.restore();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

// PointerEvent is not available in jsdom, so we polyfill it with MouseEvent
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
}

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
