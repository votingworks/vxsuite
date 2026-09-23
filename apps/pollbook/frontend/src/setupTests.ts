import '@testing-library/jest-dom/vitest';
import '@votingworks/ui/vitest-setup';
import { afterAll, vi } from 'vitest';

afterAll(() => {
  vi.useRealTimers();
});
