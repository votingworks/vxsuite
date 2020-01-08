export default function assertDefined<T>(
  value: T | null | undefined,
  message = 'value expected to be defined but was not'
): T {
  // eslint-disable-next-line no-restricted-syntax
  if (value === null || value === undefined) {
    throw new Error(message)
  }

  return value
}
