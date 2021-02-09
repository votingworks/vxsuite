import * as index from './'
import * as schema from './schema'
import * as election from './election'

test('re-exports election exports', () => {
  expect(index.findContest).toBe(election.findContest)
})

test('re-exports schema as namespace', () => {
  expect(index.schema).toEqual(schema)
})
