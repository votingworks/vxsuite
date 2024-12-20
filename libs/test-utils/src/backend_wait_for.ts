import { sleep } from '@votingworks/basics';

export interface BackendWaitForOptions {
  interval: number;
  retries: number;
}

const DEFAULT_BACKEND_WAIT_FOR_OPTIONS: BackendWaitForOptions = {
  interval: 0, // smallest possible interval
  retries: 3,
};

/**
 * Useful for waiting for `async` backend changes to land. Named to avoid
 * confusion with `waitFor` from `@testing-library/react` used in the frontends.
 */
export async function backendWaitFor(
  assertions: () => void | Promise<void>,
  options?: Partial<BackendWaitForOptions>
): Promise<void> {
  const { interval, retries } = {
    ...DEFAULT_BACKEND_WAIT_FOR_OPTIONS,
    ...(options ?? {}),
  };

  let tries = 0;

  while (tries <= retries) {
    try {
      await assertions();
      return;
    } catch (error) {
      if (tries === retries) {
        throw error;
      }
    }
    tries += 1;
    await sleep(interval);
  }
}
