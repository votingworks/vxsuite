import { Parties, Party } from '@votingworks/types'

export const findPartyById = (
  parties: Parties,
  id: string
): Party | undefined => {
  return parties.find((p) => p.id === id)
}
