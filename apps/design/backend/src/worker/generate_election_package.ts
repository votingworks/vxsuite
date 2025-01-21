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
  createElectionDefinitionForNhHmpbTemplate,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  PlaywrightRenderer,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import { writeFile } from 'node:fs/promises';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { PORT } from '../globals';
import { WorkerContext } from './context';
import { normalizeState, UsState } from '../types';
import { getUserDefinedHmpbStrings } from '../translation_utilities';

async function createElectionDefinition(
  renderer: PlaywrightRenderer,
  electionWithBallotStrings: Election,
  electionSerializationFormat: ElectionSerializationFormat
) {
  const { state } = electionWithBallotStrings;
  const normalizedState = normalizeState(state);
  switch (normalizedState) {
    case UsState.NEW_HAMPSHIRE:
      // TODO: add additional precinct split configuration to election definition
      /* istanbul ignore next */
      return await createElectionDefinitionForNhHmpbTemplate(
        renderer,
        electionWithBallotStrings,
        electionSerializationFormat
      );
    case UsState.MISSISSIPPI:
    case UsState.UNKNOWN:
    default:
      return await createElectionDefinitionForDefaultHmpbTemplate(
        renderer,
        electionWithBallotStrings,
        electionSerializationFormat
      );
  }
}

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

  const { ballotLanguageConfigs, election, systemSettings, precincts } =
    await store.getElection(electionId);

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  zip.file(ElectionPackageFileName.METADATA, JSON.stringify(metadata, null, 2));

  const userDefinedHmpbStrings = getUserDefinedHmpbStrings(precincts);
  // Combine predefined and user-defined HMPB strings here because they can be
  // translated in the same path.
  const combinedHmpbStringsCatalog: Record<string, string> = {
    ...hmpbStringsCatalog,
    ...userDefinedHmpbStrings,
  };

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      combinedHmpbStringsCatalog,
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
  const electionDefinition = await createElectionDefinition(
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

  console.log('Generating audio IDs and clips');

  const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
    appStrings,
    electionStrings,
    speechSynthesizer,
  });
  console.log('Done generating audio IDs and clips');
  zip.file(
    ElectionPackageFileName.AUDIO_IDS,
    JSON.stringify(uiStringAudioIds, null, 2)
  );
  zip.file(ElectionPackageFileName.AUDIO_CLIPS, uiStringAudioClips);

  console.log(`Zipping contents`);
  const zipContents = await zip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  console.log('Hashing contents');
  const electionPackageHash = sha256(zipContents);
  console.log('Combining hashed contents');
  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    electionPackageHash
  );
  console.log('Generating filename');
  const fileName = `election-package-${combinedHash}.zip`;
  console.log('Generating filepath');
  const filePath = path.join(assetDirectoryPath, fileName);
  console.log('Writing zip out');
  await writeFile(filePath, zipContents);
  await store.setElectionPackageUrl({
    electionId,
    electionPackageUrl: `http://localhost:${PORT}/${fileName}`,
  });
  console.log('Finished generating election package');
}
