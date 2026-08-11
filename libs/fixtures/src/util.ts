import { createHash } from 'node:crypto';
import { Election, ElectionDefinition } from '@votingworks/types';

export function asElectionDefinition(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return {
    election,
    electionData,
    ballotHash: createHash('sha256').update(electionData).digest('hex'),
  };
}
