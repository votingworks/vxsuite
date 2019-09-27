import { v0, v1 } from '.'

test('exports v0 encoding', () => {
  expect(typeof v0.encodeBallot).toBe('function')
  expect(typeof v0.decodeBallot).toBe('function')
})

test('exports v1 encoding', () => {
  expect(typeof v1.encodeBallot).toBe('function')
  expect(typeof v1.decodeBallot).toBe('function')
})
