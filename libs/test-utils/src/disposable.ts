/**
 * Wraps a value and provides a method to dispose of it. Useful for cleaning up
 * resources, especially in tests.
 *
 * @example
 *
 * ```ts
 * test('example', () => {
 *   using resource = disposable(createResource(), (r) => r.close());
 *  // Use `resource` here.
 * });
 */
export function disposable<T extends object>(
  value: T,
  dispose: (value: T) => void
): T & Disposable {
  return new Proxy(value, {
    get(target, p, receiver) {
      if (p === Symbol.dispose) {
        return () => {
          dispose(value);
        };
      }
      return Reflect.get(target, p, receiver);
    },

    has(target, p) {
      return p === Symbol.dispose || Reflect.has(target, p);
    },
  }) as T & Disposable;
}

/**
 * Wraps a value and provides a method to dispose of it asynchronously. Useful
 * for cleaning up resources, especially in tests.
 *
 * @example
 *
 * ```ts
 * test('example', async () => {
 *   await using resource = asyncDisposable(createResource(), (r) => r.close());
 *   // Use `resource` here.
 * });
 * ```
 */
export function asyncDisposable<T extends object>(
  value: T,
  dispose: (value: T) => Promise<void>
): T & AsyncDisposable {
  return new Proxy(value, {
    get(target, p, receiver) {
      if (p === Symbol.asyncDispose) {
        return async () => {
          await dispose(value);
        };
      }
      return Reflect.get(target, p, receiver);
    },

    has(target, p) {
      return p === Symbol.asyncDispose || Reflect.has(target, p);
    },
  }) as T & AsyncDisposable;
}
