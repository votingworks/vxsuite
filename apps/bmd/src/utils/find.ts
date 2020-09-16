import { Parties } from '@votingworks/ballot-encoder'

export const findPartyById = (parties: Parties, id: string) => {
  return parties.find((p) => p.id === id)
}

export default { findPartyById }
