import { createWriteStream } from 'fs';
import JsZip from 'jszip';
import path from 'path';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import { throwIllegalValue } from '@votingworks/basics';
import { layOutAllBallotStyles } from '@votingworks/hmpb-layout';
import {
  BallotType,
  ElectionPackageFileName,
  getDisplayElectionHash,
  Id,
  safeParseJson,
} from '@votingworks/types';

import { PORT } from '../globals';
import { BackgroundTask } from '../store';
import { Workspace } from '../workspace';

async function generateElectionPackage(
  { assetDirectoryPath, store }: Workspace,
  { electionId }: { electionId: Id }
): Promise<void> {
  const { election, layoutOptions, systemSettings } =
    store.getElection(electionId);
  const { electionDefinition } = layOutAllBallotStyles({
    election,
    // Ballot type and ballot mode shouldn't change the election definition, so it doesn't matter
    // what we pass here
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions,
  }).unsafeUnwrap();
  const zip = new JsZip();
  zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData);
  zip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(systemSettings, null, 2)
  );

  const displayElectionHash = getDisplayElectionHash(electionDefinition);
  const fileName = `election-package-${displayElectionHash}.zip`;
  const filePath = path.join(assetDirectoryPath, fileName);
  await pipeline(
    zip.generateNodeStream({ streamFiles: true }),
    createWriteStream(filePath)
  );
  store.setElectionPackageUrl({
    electionId,
    electionPackageUrl: `http://localhost:${PORT}/${fileName}`,
  });
}

export async function processBackgroundTask(
  workspace: Workspace,
  { taskName, payload }: BackgroundTask
): Promise<void> {
  switch (taskName) {
    case 'generate_election_package': {
      const parsedPayload = safeParseJson(
        payload,
        z.object({ electionId: z.string() })
      ).unsafeUnwrap();
      await generateElectionPackage(workspace, parsedPayload);
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(taskName);
    }
  }
}
