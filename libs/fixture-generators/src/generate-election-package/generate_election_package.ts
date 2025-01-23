import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import {
  allBaseBallotProps,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderMinimalBallotsToCreateElectionDefinition,
} from '@votingworks/hmpb';
import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionPackage,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  getBallotLanguageConfigs,
  LATEST_METADATA,
  mergeUiStrings,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';
import JsZip from 'jszip';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleCloudTranslatorWithElectionCache } from './translator_with_election_cache';
import { MockTextToSpeechSynthesizer } from './mock_speech_synthesizer';

// In order for the zip files generated to hash to the same value when the contents
// are the same we need to make sure the date on the files is always kept static.
const FIXTURES_FILE_DATE = new Date('2024-12-01T00:00:00Z');

/**
 * Generates an election with mock content based on the given parameters.
 */
export async function generateElectionPackage(
  election: Election,
  assetDirectoryPath: string,
  isMultiLanguage: boolean,
  priorElectionPackage?: ElectionPackage
): Promise<[string, string]> {
  const renderer = await createPlaywrightRenderer();

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  zip.file(
    ElectionPackageFileName.METADATA,
    JSON.stringify(metadata, null, 2),
    { date: FIXTURES_FILE_DATE }
  );

  const ballotLanguageConfigs = getBallotLanguageConfigs(isMultiLanguage);
  const translator = new GoogleCloudTranslatorWithElectionCache({
    priorElectionPackage,
  });

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      hmpbStringsCatalog,
      ballotLanguageConfigs
    );

  zip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2),
    { date: FIXTURES_FILE_DATE }
  );

  const ballotStrings = mergeUiStrings(electionStrings, hmpbStrings);
  const electionWithBallotStrings: Election = {
    ...election,
    ballotStrings,
  };
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates.VxDefaultBallot,
      allBaseBallotProps(electionWithBallotStrings),
      'vxf'
    );

  zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData, {
    date: FIXTURES_FILE_DATE,
  });
  await renderer.cleanup();

  zip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(DEFAULT_SYSTEM_SETTINGS, null, 2),
    { date: FIXTURES_FILE_DATE }
  );

  // Generate audio clips and ids with a mock text to speech client to reduce bloat.
  const speechSynthesizer = new MockTextToSpeechSynthesizer();
  const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
    appStrings,
    electionStrings,
    speechSynthesizer,
  });
  zip.file(
    ElectionPackageFileName.AUDIO_IDS,
    JSON.stringify(uiStringAudioIds, null, 2),
    { date: FIXTURES_FILE_DATE }
  );
  zip.file(ElectionPackageFileName.AUDIO_CLIPS, uiStringAudioClips, {
    date: FIXTURES_FILE_DATE,
  });

  const zipContents = await zip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const fileName = `election-package-default-system-settings.zip`;
  const packageFilePath = path.join(assetDirectoryPath, fileName);
  const suffix = isMultiLanguage ? 'MultiLang' : 'EnglishOnly';
  const electionFilePath = path.join(
    assetDirectoryPath,
    `electionGeneratedWithGridLayouts${suffix}.json`
  );
  const electionPackageHash = sha256(zipContents);

  await writeFile(packageFilePath, zipContents);
  await writeFile(electionFilePath, electionDefinition.electionData);
  return [electionDefinition.ballotHash, electionPackageHash];
}
