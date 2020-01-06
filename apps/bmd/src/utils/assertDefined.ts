export default function assertDefined<T>(
  value: T | null | undefined,
  message = 'value expected to be defined but was not'
): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }

  return value
}
