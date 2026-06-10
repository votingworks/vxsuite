import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { TextDecoder, TextEncoder } from 'node:util';
import { BooleanEnvironmentVariableName as Feature } from '@votingworks/utils';
import { configure } from '../test/react_testing_library';

expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

beforeEach(() => {
  // [TODO] Remove after full migration of libs/ui.
  process.env[Feature.ENABLE_POLLING_PLACES] = 'TRUE';
});
