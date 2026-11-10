import { afterAll, vi } from 'vitest';
import '@votingworks/test-utils/vitest-setup';
import { configure } from '@testing-library/react';

configure({ reactStrictMode: true });

HTMLElement.prototype.scrollIntoView = vi.fn();

afterAll(() => {
  vi.useRealTimers();
});
