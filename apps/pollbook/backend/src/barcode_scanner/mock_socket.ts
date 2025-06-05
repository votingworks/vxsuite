/* istanbul ignore next */
/* eslint-disable vx/gts-no-public-class-fields */
import { assert } from 'node:console';
import { vi } from 'vitest';

type MockSocketEventName = 'connect' | 'error';

export class MockSocket {
  private handlers: Record<MockSocketEventName, (arg?: unknown) => void> = {
    connect: () => {
      throw new Error("'connect' is unmocked");
    },
    error: () => {
      throw new Error("'error' is unmocked");
    },
  };

  on = vi.fn((event: MockSocketEventName, cb: (arg?: unknown) => void) => {
    this.handlers[event] = cb;
    return this;
  });

  once = vi.fn((event: MockSocketEventName, cb: (arg?: unknown) => void) => {
    this.handlers[event] = cb;
    return this;
  });

  setEncoding = vi.fn();
  destroy = vi.fn();

  emitConnect(): void {
    const handler = this.handlers['connect'];
    assert(handler, "Could not find handler for 'connect'");
    handler();
  }

  emitError(err: Error): void {
    const handler = this.handlers['error'];
    assert(handler, "Could not find handler for 'error'");
    handler(err);
  }
}
