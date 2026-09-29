import '@votingworks/test-utils/vitest-setup';
import { afterAll, vi } from 'vitest';

afterAll(() => {
  vi.useRealTimers();
});
