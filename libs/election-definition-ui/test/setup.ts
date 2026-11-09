import { afterAll, vi } from 'vitest';
import '@votingworks/test-utils/vitest-setup';
import { configure } from '@testing-library/react';

configure({ reactStrictMode: true });

afterAll(() => {
  vi.useRealTimers();
});
