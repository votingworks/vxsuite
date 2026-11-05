import { beforeEach, vi } from 'vitest';
import { clearImmediate, setImmediate } from 'node:timers';
import { TextDecoder, TextEncoder } from 'node:util';
import '@votingworks/fixtures/vitest-setup';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) =>
      Promise.reject(new Error(`unexpected fetch: ${String(input)}`))
    )
  );
});

globalThis.clearImmediate = clearImmediate;
globalThis.setImmediate = setImmediate;
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;
