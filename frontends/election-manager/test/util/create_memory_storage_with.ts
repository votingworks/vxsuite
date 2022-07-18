import { ElectionDefinition } from '@votingworks/types';
import { MemoryStorage } from '@votingworks/utils';

import { CastVoteRecordFiles } from '../../src/utils/cast_vote_record_files';
import {
  configuredAtStorageKey,
  cvrsStorageKey,
  electionDefinitionStorageKey,
} from '../../src/app_root';

export async function createMemoryStorageWith({
  electionDefinition,
  crvFile,
}: {
  electionDefinition: ElectionDefinition;
  crvFile?: File;
}): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  await storage.set(electionDefinitionStorageKey, electionDefinition);
  if (crvFile) {
    const castVoteRecordFiles = await CastVoteRecordFiles.empty.add(
      crvFile,
      electionDefinition.election
    );
    await storage.set(cvrsStorageKey, castVoteRecordFiles.export());
  }
  await storage.set(configuredAtStorageKey, new Date().toISOString());
  return storage;
}
