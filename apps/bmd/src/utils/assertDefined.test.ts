import assertDefined from './assertDefined'

test('returns a falsy argument when it is not null or undefined', () => {
  expect(assertDefined(0)).toBe(0)
})

test('returns an object argument', () => {
  const obj = {}
  expect(assertDefined(obj)).toBe(obj)
})

test('throws when given null', () => {
  // eslint-disable-next-line no-restricted-syntax
  expect(() => assertDefined(null)).toThrowError()
})

test('throws when given undefined', () => {
  expect(() => assertDefined(undefined)).toThrowError()
})

test('refines the type of the argument by removing null', () => {
  // This isn't a runtime check, really. It just ensures TypeScript is happy.
  const original: string | null = 'a string'
  const refined: string = assertDefined(original)
  expect(refined).toBe(original)
})

test('refines the type of the argument by removing undefined', () => {
  // This isn't a runtime check, really. It just ensures TypeScript is happy.
  const original: string | undefined = 'a string'
  const refined: string = assertDefined(original)
  expect(refined).toBe(original)
})

test('can throw with a custom message', () => {
  expect(() => assertDefined(undefined, 'no undefined!')).toThrowError(
    'no undefined!'
  )
})
