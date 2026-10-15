import { beforeEach, vi } from 'vitest';
import '@votingworks/test-utils/vitest-setup';
import { configure } from '@testing-library/react';
import '@votingworks/fixtures/vitest-setup';

configure({ asyncUtilTimeout: 5_000, reactStrictMode: true });

beforeEach(() => {
  globalThis.print = vi.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
});
