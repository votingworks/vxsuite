import { afterEach, expect } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from '../test/react_testing_library';

expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

afterEach(cleanup);
