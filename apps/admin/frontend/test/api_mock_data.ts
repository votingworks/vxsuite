import { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import { Candidate } from '@votingworks/types';

export const mockCastVoteRecordFileRecord: CastVoteRecordFileRecord = {
  id: '',
  electionId: '',
  filename: '',
  exportTimestamp: '',
  numCvrsImported: 0,
  precinctIds: [],
  scannerIds: [],
  sha256Hash: '',
  createdAt: '',
};

export function getMockWriteInCandidate(name: string): Candidate {
  return {
    id: name.toLowerCase(),
    name,
    isWriteIn: true,
  };
}

export function getMockTempWriteInCandidate(name: string): Candidate {
  return {
    id: `temp-write-in-(${name})`,
    name,
    isWriteIn: true,
  };
}
