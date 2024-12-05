import { Optional } from '@votingworks/basics';

/**
 * Gets the current test runner's utilities. This could be Jest or Vitest, but
 * we type the return value as Jest to avoid type errors.
 */
export async function getTestRunner(): Promise<typeof jest> {
  if (typeof jest !== 'undefined') {
    return jest;
  }

  return (await import('vitest')).vi as unknown as typeof jest;
}

/**
 * Gets the current test name.
 */
export async function getCurrentTestName(): Promise<Optional<string>> {
  const state =
    typeof jest !== 'undefined'
      ? expect.getState()
      : (await import('vitest')).expect.getState();
  return state.currentTestName;
}
