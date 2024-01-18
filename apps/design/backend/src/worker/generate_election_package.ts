import { createWriteStream } from 'fs';
import JsZip from 'jszip';
import path from 'path';
import { pipeline } from 'stream/promises';
import { layOutAllBallotStyles } from '@votingworks/hmpb-layout';
import {
  BallotType,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  getDisplayElectionHash,
  Id,
} from '@votingworks/types';

import { PORT } from '../globals';
import {
  extractAndTranslateElectionStrings,
  generateAudioIdsAndClips,
  translateAppStrings,
} from '../language_and_audio';
import { WorkerContext } from './context';

export async function generateElectionPackage(
  { speechSynthesizer, translator, workspace }: WorkerContext,
  { electionId }: { electionId: Id }
): Promise<void> {
  const { assetDirectoryPath, store } = workspace;

  const { election, layoutOptions, systemSettings, nhCustomContent } =
    store.getElection(electionId);

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = {
    version: 'latest',
  };
  zip.file(ElectionPackageFileName.METADATA, JSON.stringify(metadata, null, 2));

  const appStrings = await translateAppStrings(translator, metadata.version);
  zip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );

  const { electionStrings, vxElectionStrings } =
    await extractAndTranslateElectionStrings(translator, election);
  zip.file(
    ElectionPackageFileName.VX_ELECTION_STRINGS,
    JSON.stringify(vxElectionStrings, null, 2)
  );

  const { electionDefinition } = layOutAllBallotStyles({
    election,
    // Ballot type and ballot mode shouldn't change the election definition, so it doesn't matter
    // what we pass here
    ballotType: BallotType.Precinct,
    ballotMode: 'test',
    layoutOptions,
    nhCustomContent,
    translatedElectionStrings: electionStrings,
  }).unsafeUnwrap();
  zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData);

  zip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(systemSettings, null, 2)
  );

  const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
    appStrings,
    electionStrings,
    speechSynthesizer,
  });
  zip.file(
    ElectionPackageFileName.AUDIO_IDS,
    JSON.stringify(uiStringAudioIds, null, 2)
  );
  zip.file(ElectionPackageFileName.AUDIO_CLIPS, uiStringAudioClips);

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
