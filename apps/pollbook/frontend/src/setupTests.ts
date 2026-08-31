import matchers from '@testing-library/jest-dom/matchers';
import { afterAll, expect, vi } from 'vitest';

expect.extend(matchers);

afterAll(() => {
  vi.useRealTimers();
});
