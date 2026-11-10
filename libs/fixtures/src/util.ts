import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { Election, ElectionDefinitionWithData } from '@votingworks/types';

export function asElectionDefinition(
  election: Election
): ElectionDefinitionWithData {
  const electionData = Buffer.from(JSON.stringify(election));
  return {
    election,
    electionData,
    ballotHash: createHash('sha256').update(electionData).digest('hex'),
  };
}
