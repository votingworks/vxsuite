import { Parties, Party } from '@votingworks/types'

const findPartyById = (parties: Parties, id: string): Party | undefined => {
  return parties.find((p) => p.id === id)
}

export default findPartyById
