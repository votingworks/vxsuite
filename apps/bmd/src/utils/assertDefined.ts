export default function assertDefined(
  value: unknown,
  message = 'value expected to be defined but was not'
): asserts value {
  // eslint-disable-next-line no-restricted-syntax
  if (value === null || value === undefined) {
    throw new Error(message)
  }
}
