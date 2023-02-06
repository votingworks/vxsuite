/* eslint-disable no-console -- this file monkey-patches `console` */

/**
 * Suppresses the "Can't perform a React state update on an unmounted component" warning by
 * modifying the `console.error` method to ignore the warning.
 *
 * This is a temporary workaround until we upgrade to React 18.
 */
export function suppressReact17UnmountedWarning(): void {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].startsWith(
        `Warning: Can't perform a React state update on an unmounted component`
      )
    ) {
      return;
    }

    originalConsoleError(...args);
  };
}
