import fs from 'fs/promises';
import JsZip from 'jszip';
import path from 'path';
import { z } from 'zod';
import { throwIllegalValue } from '@votingworks/basics';
import { layOutAllBallotStyles } from '@votingworks/hmpb-layout';
import {
  BallotType,
  ElectionPackageFileName,
  Id,
  safeParseJson,
} from '@votingworks/types';

import { ASSETS_DIRECTORY_PATH, PORT } from '../globals';
import { BackgroundTask, Store } from '../store';

export async function generateElectionPackage(
  store: Store,
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

  await fs.mkdir(ASSETS_DIRECTORY_PATH, { recursive: true });
  const fileName = `${electionId}-${new Date().toISOString()}.zip`;
  const filePath = path.join(ASSETS_DIRECTORY_PATH, fileName);
  await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
  store.setElectionPackageFilePath({
    electionId,
    electionPackageFilePath: `http://localhost:${PORT}/${fileName}`,
  });
}

export async function processBackgroundTask(
  store: Store,
  { taskName, payload }: BackgroundTask
): Promise<void> {
  switch (taskName) {
    case 'generate_election_package': {
      const parsedPayload = safeParseJson(
        payload,
        z.object({ electionId: z.string() })
      ).unsafeUnwrap();
      await generateElectionPackage(store, parsedPayload);
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(taskName);
    }
  }
}
