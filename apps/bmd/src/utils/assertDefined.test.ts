import assertDefined from './assertDefined'

test('does not throw when given 0', () => {
  expect(() => assertDefined(0)).not.toThrowError()
})

test('does not throw when given an empty object', () => {
  expect(() => assertDefined({})).not.toThrowError()
})

test('throws when given null', () => {
  // eslint-disable-next-line no-restricted-syntax
  expect(() => assertDefined(null)).toThrowError()
})

test('throws when given undefined', () => {
  expect(() => assertDefined(undefined)).toThrowError()
})

// This isn't a runtime check, really. It just ensures TypeScript is happy.
test('refines the type of the argument by removing null', () => {
  // Declare that `value` might be `null`.
  const value: string | null = 'a string'

  // Assert that it isn't `null`.
  assertDefined(value)

  // Use it as though it isn't `null`.
  value.toUpperCase()
})

// This isn't a runtime check, really. It just ensures TypeScript is happy.
test('refines the type of the argument by removing undefined', () => {
  // Declare that `value` might be `undefined`.
  const value: string | undefined = 'a string'

  // Assert that it isn't `undefined`.
  assertDefined(value)

  // Use it as though it isn't `undefined`.
  value.toUpperCase()
})

test('can throw with a custom message', () => {
  expect(() => assertDefined(undefined, 'no undefined!')).toThrowError(
    'no undefined!'
  )
})
