import { Parties, Party } from '@votingworks/types'

export const findPartyById = (
  parties: Parties,
  id: string
): Party | undefined => parties.find((p) => p.id === id)
