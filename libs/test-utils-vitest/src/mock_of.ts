/* eslint-disable @typescript-eslint/no-explicit-any */
import { MockedFunction } from 'vitest';

/**
 * Returns a properly-typed mock for an already-mocked function.
 *
 * @example
 *
 * import * as fs from 'node:fs'
 * vi.mock('node:fs')
 * const readFileMock = mockOf(fs.readFile)
 * readFileMock.mockImplementation(…)
 */
export function mockOf<T extends (...args: any[]) => any>(
  fn: T
): MockedFunction<T> {
  return fn as MockedFunction<T>;
}
