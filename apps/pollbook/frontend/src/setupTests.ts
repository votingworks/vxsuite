import matchers from '@testing-library/jest-dom/matchers';
import { afterAll, expect, vi } from 'vitest';
import { notifyManager } from '@tanstack/react-query';

expect.extend(matchers);

afterAll(() => {
  vi.useRealTimers();
});

// react-query v5 defers its subscriber notifications by a scheduler tick,
// where v4 delivered them synchronously. Tests that click a control as soon
// as it renders would otherwise act on stale (still-loading) state. Flushing
// synchronously restores the v4 timing for tests only.
notifyManager.setScheduler((cb) => cb());
