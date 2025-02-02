import JsZip from 'jszip';
import path from 'node:path';
import {
  ElectionSerializationFormat,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  mergeUiStrings,
  Election,
  formatElectionHashes,
  LATEST_METADATA,
  SystemSettings,
  MarkThresholds,
  AdjudicationReason,
  ElectionId,
} from '@votingworks/types';
import {
  renderMinimalBallotsToCreateElectionDefinition,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  ballotTemplates,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { WorkerContext } from './context';
import { createBallotPropsForTemplate } from '../ballots';

export interface V3SystemSettings {
  readonly auth: SystemSettings['auth'];
  readonly markThresholds: MarkThresholds;
  readonly centralScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly precinctScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly precinctScanDisallowCastingOvervotes: boolean;
}

function makeV3Compatible(zip: JsZip, systemSettings: SystemSettings): void {
  zip.remove(ElectionPackageFileName.METADATA);
  zip.remove(ElectionPackageFileName.APP_STRINGS);
  zip.remove(ElectionPackageFileName.AUDIO_IDS);
  zip.remove(ElectionPackageFileName.AUDIO_CLIPS);
  zip.remove(ElectionPackageFileName.SYSTEM_SETTINGS);

  const {
    auth,
    centralScanAdjudicationReasons,
    precinctScanAdjudicationReasons,
    disallowCastingOvervotes,
    markThresholds,
  } = systemSettings;
  const v3SystemSettings: V3SystemSettings = {
    auth,
    markThresholds,
    centralScanAdjudicationReasons,
    precinctScanAdjudicationReasons,
    precinctScanDisallowCastingOvervotes: disallowCastingOvervotes,
  };
  zip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(v3SystemSettings, null, 2)
  );
}

export async function generateElectionPackage(
  {
    fileStorageClient,
    speechSynthesizer,
    translator,
    workspace,
  }: WorkerContext,
  {
    electionId,
    electionSerializationFormat,
    orgId,
  }: {
    electionId: ElectionId;
    electionSerializationFormat: ElectionSerializationFormat;
    orgId: string;
  }
): Promise<void> {
  const { store } = workspace;

  const {
    ballotLanguageConfigs,
    election,
    systemSettings,
    precincts,
    ballotStyles,
    ballotTemplateId,
  } = await store.getElection(electionId);

  const zip = new JsZip();

  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  zip.file(ElectionPackageFileName.METADATA, JSON.stringify(metadata, null, 2));

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      hmpbStringsCatalog,
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
  const allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    electionWithBallotStrings,
    precincts,
    ballotStyles
  );
  const renderer = await createPlaywrightRenderer();
  const electionDefinition =
    await renderMinimalBallotsToCreateElectionDefinition(
      renderer,
      ballotTemplates[ballotTemplateId],
      allBallotProps,
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

  if (ballotTemplateId === 'NhBallotV3') {
    makeV3Compatible(zip, systemSettings);
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

  const writeResult = await fileStorageClient.writeFile(
    path.join(orgId, fileName),
    zipContents
  );
  writeResult.unsafeUnwrap();
  const electionPackageUrl = `/files/${orgId}/${fileName}`;

  await store.setElectionPackageUrl({
    electionId,
    electionPackageUrl,
  });
}
