import '@votingworks/test-utils/vitest-setup';
import { afterAll, vi } from 'vitest';
import { configure } from '@testing-library/react';

configure({ reactStrictMode: true });

afterAll(() => {
  vi.useRealTimers();
});
