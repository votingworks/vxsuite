import { Party } from '@votingworks/ballot-encoder'
import { findPartyById } from './findPartyById'

const martian: Party = {
  id: 'martian',
  abbrev: 'MAR',
  fullName: 'The Martian Party',
  name: 'Martian',
}

test('finds a party by id when it exists', () => {
  expect(findPartyById([martian], 'martian')).toBe(martian)
})

test('returns undefined when no party with a given id exists', () => {
  expect(findPartyById([], 'martian')).toBeUndefined()
  expect(findPartyById([martian], 'martian2')).toBeUndefined()
})
