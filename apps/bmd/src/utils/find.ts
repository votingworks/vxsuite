import { Parties } from '../config/types'

const findPartyById = (parties: Parties, id: string) => {
  return parties.find(p => p.id === id)
}

export { findPartyById }
