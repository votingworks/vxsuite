import assert from './assert'

export default function assertDefined<T>(
  value: T | null | undefined,
  message = 'value expected to be defined but was not'
): asserts value is T {
  // eslint-disable-next-line no-restricted-syntax
  assert(value !== null && value !== undefined, message)
}
