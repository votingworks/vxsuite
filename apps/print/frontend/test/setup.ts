import '@votingworks/fixtures/vitest-setup';
import '@votingworks/test-utils/vitest-setup';
import { TextDecoder, TextEncoder } from 'node:util';

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;
