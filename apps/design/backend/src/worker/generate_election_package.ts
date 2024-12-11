import JsZip from 'jszip';
import path from 'node:path';
import {
  ElectionSerializationFormat,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  Id,
  mergeUiStrings,
  Election,
  formatElectionHashes,
  LATEST_METADATA,
} from '@votingworks/types';

import {
  createElectionDefinitionForDefaultHmpbTemplate,
  createPlaywrightRenderer,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import { writeFile } from 'node:fs/promises';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { PORT } from '../globals';
import { WorkerContext } from './context';

export async function generateElectionPackage(
  { speechSynthesizer, translator, workspace }: WorkerContext,
  {
    electionId,
    electionSerializationFormat,
  }: {
    electionId: Id;
    electionSerializationFormat: ElectionSerializationFormat;
  }
): Promise<void> {
  const { assetDirectoryPath, store } = workspace;

  const { ballotLanguageConfigs, election, systemSettings } =
    store.getElection(electionId);

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  zip.file(ElectionPackageFileName.METADATA, JSON.stringify(metadata, null, 2));

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      ballotLanguageConfigs
    );

  zip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );

  const ballotStrings = mergeUiStrings(electionStrings, hmpbStrings);
  const electionWithBallotStrings: Election = {
    ...election,
    ballotStrings,
  };

  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await createElectionDefinitionForDefaultHmpbTemplate(
      renderer,
      electionWithBallotStrings,
      electionSerializationFormat
    );
  zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData);

  // eslint-disable-next-line no-console
  renderer.cleanup().catch(console.error);

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

  const zipContents = await zip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const electionPackageHash = sha256(zipContents);
  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    electionPackageHash
  );
  const fileName = `election-package-${combinedHash}.zip`;
  const filePath = path.join(assetDirectoryPath, fileName);
  await writeFile(filePath, zipContents);
  store.setElectionPackageUrl({
    electionId,
    electionPackageUrl: `http://localhost:${PORT}/${fileName}`,
  });
}
