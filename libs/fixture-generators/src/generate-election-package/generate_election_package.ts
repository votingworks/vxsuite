// import { generateElectionPackage } from '@votingworks/hmpb';
import {
  BallotLanguageConfig,
  BallotLanguageConfigs,
  GoogleCloudSpeechSynthesizerWithoutCache,
  GoogleCloudTranslatorWithoutCache,
  LanguageCode,
  translateAppStrings,
  extractAndTranslateElectionStrings,
  translateHmpbStrings,
  generateAudioIdsAndClips,
} from '@votingworks/design-backend';
import {
  createPlaywrightRenderer,
  renderAllBallotsAndCreateElectionDefinition,
  Renderer,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb';
import {
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionDefinition,
  ElectionPackage,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  formatElectionHashes,
  mergeUiStrings,
  UiStringsPackage,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { sha256 } from 'js-sha256';
import JsZip from 'jszip';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

// In order for the zip files generated to hash to the same value when the contents
// are the same we need to make sure the date on the files is always kept static.
const FIXTURES_FILE_DATE = new Date('2024-12-01T00:00:00Z');

function getBallotLanguageConfigs(): BallotLanguageConfigs {
  const translationsEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );
  return translationsEnabled
    ? Object.values(LanguageCode).map(
        (l): BallotLanguageConfig => ({ languages: [l] })
      )
    : [{ languages: [LanguageCode.ENGLISH] }];
}
/**
 * Generates all of the new strings for an election.
 */
export async function getAllStringsForElection(
  election: Election,
  translator: GoogleCloudTranslatorWithoutCache,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<[UiStringsPackage, UiStringsPackage, UiStringsPackage]> {
  const appStrings = await translateAppStrings(
    translator,
    'latest',
    ballotLanguageConfigs
  );
  const hmpbStrings = await translateHmpbStrings(
    translator,
    ballotLanguageConfigs
  );
  const electionStrings = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );

  return [appStrings, hmpbStrings, electionStrings];
}

/**
 * Wrapper helper to generate an election definition with grid layouts from a given election.
 */
export async function generateElectionDefinitionForHmpbs(
  renderer: Renderer,
  election: Election
): Promise<ElectionDefinition> {
  const { electionDefinition } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      vxDefaultBallotTemplate,
      // Each ballot style will have exactly one grid layout regardless of precinct, ballot type, or ballot mode
      // So we just need to render a single ballot per ballot style to create the election definition
      election.ballotStyles.map((ballotStyle) => ({
        election,
        ballotStyleId: ballotStyle.id,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        precinctId: ballotStyle.precincts[0]!,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })),
      'vxf'
    );
  return electionDefinition;
}

/**
 * Generates an election with mock content based on the given parameters.
 */
export async function generateElectionPackage(
  election: Election,
  assetDirectoryPath: string,
  priorElectionPackage?: ElectionPackage
): Promise<ElectionDefinition> {
  const renderer = await createPlaywrightRenderer();

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = {
    version: 'latest',
  };
  zip.file(
    ElectionPackageFileName.METADATA,
    JSON.stringify(metadata, null, 2),
    { date: FIXTURES_FILE_DATE }
  );

  const ballotLanguageConfigs = getBallotLanguageConfigs();
  const translator = new GoogleCloudTranslatorWithoutCache({
    priorElectionPackage,
  });

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElection(election, translator, ballotLanguageConfigs);

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

  const electionDefinition = await generateElectionDefinitionForHmpbs(
    renderer,
    electionWithBallotStrings
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

  // If a prior election package was provided, check to see if the app strings and ballot strings / election definition
  // have changed. If they have not we can reuse the audio clips and audio ids from the prior election package. Otherwise
  // we will regenerate them.
  if (
    priorElectionPackage &&
    electionDefinition.electionData ===
      priorElectionPackage.electionDefinition.electionData &&
    electionDefinition.ballotHash ===
      priorElectionPackage.electionDefinition.ballotHash &&
    JSON.stringify(mergeUiStrings(appStrings, ballotStrings)) ===
      JSON.stringify(priorElectionPackage.uiStrings) &&
    priorElectionPackage.uiStringAudioIds &&
    priorElectionPackage.uiStringAudioClips
  ) {
    zip.file(
      ElectionPackageFileName.AUDIO_IDS,
      JSON.stringify(priorElectionPackage.uiStringAudioIds, null, 2),
      { date: FIXTURES_FILE_DATE }
    );
    zip.file(
      ElectionPackageFileName.AUDIO_CLIPS,
      Readable.from(
        priorElectionPackage.uiStringAudioClips.map(
          (clip) => `${JSON.stringify(clip)}\n`
        )
      ),
      { date: FIXTURES_FILE_DATE }
    );
  } else {
    const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithoutCache({});

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
  }

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
  const packageFilePath = path.join(assetDirectoryPath, fileName);
  const electionFilePath = path.join(
    assetDirectoryPath,
    `generated-election-${combinedHash}.json`
  );
  console.log(`Writing election package to ${packageFilePath}`);
  await writeFile(packageFilePath, zipContents);
  await writeFile(electionFilePath, electionDefinition.electionData);
  return electionDefinition;
}
