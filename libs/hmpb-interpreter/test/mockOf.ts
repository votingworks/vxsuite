/**
 * Returns a properly-typed mock for an already-mocked function.
 *
 * @example
 *
 * import * as fs from 'fs'
 * jest.mock('fs')
 * const readFileMock = mockOf(fs.readFile)
 * readFileMock.mockImplementation(…)
 */
export default function mockOf<T extends (...args: unknown[]) => unknown>(
  fn: T
): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>
}
