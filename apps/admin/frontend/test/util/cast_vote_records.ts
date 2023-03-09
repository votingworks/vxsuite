import { CastVoteRecord, ElectionDefinition } from '@votingworks/types';
import { CastVoteRecordFiles } from '../../src/utils/cast_vote_record_files';

export async function fileDataToCastVoteRecords(
  data: string,
  electionDefinition: ElectionDefinition
): Promise<CastVoteRecord[]> {
  const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
    new File([data], 'cvrs.txt'),
    electionDefinition.election
  );
  return Array.from(castVoteRecordFiles.castVoteRecords);
}
