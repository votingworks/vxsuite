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

  /**
   * Binds an event handler for mock socket but does NOT implement 'once' behavior.
   * ie. handlers bound by `once` behave exactly the same as handlers bound by `on`
   * and are not cleared after being called.
   * Current tests don't need that functionality but clearing handlers can be
   * implemented if future tests require it.
   */
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
