import { Parties, Party } from '@votingworks/types';

function findPartyById(parties: Parties, id: string): Party | undefined {
  return parties.find((p) => p.id === id);
}

export default findPartyById;
