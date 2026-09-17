import '@votingworks/fixtures/vitest-setup';
import '@testing-library/jest-dom/vitest';
import { TextDecoder, TextEncoder } from 'node:util';

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;
