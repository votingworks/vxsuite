import assert from './assert'

it('throws when given literal false', () => {
  expect(() => assert(false)).toThrowError()
})

it('does not throw when given literal true', () => {
  expect(() => assert(true)).not.toThrowError()
})

it('asserts for type checking purposes that the statement is true', () => {
  // Set up a value whose type is not known.
  const a: unknown = 1

  // Assert that it is a number.
  assert(typeof a === 'number')

  // This would not type check if TypeScript considered `a` to be `unknown`.
  a.toFixed()
})
