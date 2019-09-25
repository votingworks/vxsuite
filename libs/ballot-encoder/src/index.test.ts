import { v0, v1 } from '.'

test('exports v0 encoding', () => {
  expect(typeof v0.encodeBallotInto).toBe('function')
})

test('exports v1 encoding', () => {
  expect(typeof v1.encodeVotes).toBe('function')
})
