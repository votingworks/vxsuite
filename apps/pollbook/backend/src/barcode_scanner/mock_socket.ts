/* istanbul ignore next */
/* eslint-disable vx/gts-no-public-class-fields */
import { vi } from 'vitest';

export class MockSocket {
  private handlers: Record<string, (arg?: unknown) => void> = {};

  on = vi.fn((event: string, cb: (arg?: unknown) => void) => {
    this.handlers[event] = cb;
    return this;
  });

  setEncoding = vi.fn();
  destroy = vi.fn();

  emitConnect(): void {
    this.handlers['connect']?.();
  }

  emitError(err: Error): void {
    this.handlers['error']?.(err);
  }
}
