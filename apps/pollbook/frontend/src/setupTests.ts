import '@testing-library/jest-dom/vitest';
import { afterAll, vi } from 'vitest';

afterAll(() => {
  vi.useRealTimers();
});
