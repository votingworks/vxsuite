import { createWriteStream } from 'fs';
import JsZip from 'jszip';
import path from 'path';
import { pipeline } from 'stream/promises';
import {
  BallotType,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  getDisplayElectionHash,
  getPrecinctById,
  Id,
} from '@votingworks/types';

import {
  createPlaywrightRenderer,
  renderAllBallotsAndCreateElectionDefinition,
  vxDefaultBallotTemplate,
} from '@votingworks/hmpb-render-backend';
import { assertDefined } from '@votingworks/basics';
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

  const { ballotLanguageConfigs, election, systemSettings } =
    store.getElection(electionId);

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = {
    version: 'latest',
  };
  zip.file(ElectionPackageFileName.METADATA, JSON.stringify(metadata, null, 2));

  const appStrings = await translateAppStrings(
    translator,
    metadata.version,
    ballotLanguageConfigs
  );
  zip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );

  const { electionStrings, vxElectionStrings } =
    await extractAndTranslateElectionStrings(
      translator,
      election,
      ballotLanguageConfigs
    );
  zip.file(
    ElectionPackageFileName.VX_ELECTION_STRINGS,
    JSON.stringify(vxElectionStrings, null, 2)
  );

  const renderer = await createPlaywrightRenderer();
  const { electionDefinition } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      vxDefaultBallotTemplate,
      // Each ballot style will have exactly one grid layout regardless of precinct, ballot type, or ballot mode
      // So we just need to render a single ballot per ballot style to create the election definition
      election.ballotStyles.map((ballotStyle) => ({
        election,
        ballotStyle,
        precinct: assertDefined(
          getPrecinctById({ election, precinctId: ballotStyle.precincts[0] })
        ),
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
        // TODO incorporate translatedElectionStrings
        // translatedElectionStrings: electionStrings,
      }))
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
