import '@votingworks/fixtures/vitest-setup';
import '@votingworks/test-utils/vitest-setup';
import { TextDecoder, TextEncoder } from 'node:util';
import { configure } from '@testing-library/react';

configure({ reactStrictMode: true });

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;
