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
  getPrecinctById,
  formatBallotHash,
} from '@votingworks/types';
import {
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  ballotTemplates,
  renderAllBallotsAndCreateElectionDefinition,
  BallotLayoutError,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { assertDefined, iter, ok, Result } from '@votingworks/basics';
import { WorkerContext } from './context';
import { createBallotPropsForTemplate } from '../ballots';
import { renderBallotStyleReadinessReport } from '../ballot_style_reports';
import { getPdfFileName } from '../utils';
import { FileStorageClientError } from '../file_storage_client';

const BALLOT_STYLE_READINESS_REPORT_FILE_NAME =
  'ballot-style-readiness-report.pdf';

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

export async function generateElectionPackageAndBallots(
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
): Promise<
  Result<void, BallotLayoutError | FileStorageClientError | Error | SyntaxError>
> {
  const { store } = workspace;

  const {
    ballotLanguageConfigs,
    election,
    systemSettings,
    precincts,
    ballotStyles,
    ballotTemplateId,
  } = await store.getElection(electionId);

  // This function makes separate zips for ballot package and election package
  // then wraps both in an outer zip for export.
  const ballotsZip = new JsZip();
  const electionPackageZip = new JsZip();
  const combinedZip = new JsZip();

  // Make election package
  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  electionPackageZip.file(
    ElectionPackageFileName.METADATA,
    JSON.stringify(metadata, null, 2)
  );

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      hmpbStringsCatalog,
      ballotLanguageConfigs
    );

  electionPackageZip.file(
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
  const renderResult = await renderAllBallotsAndCreateElectionDefinition(
    renderer,
    ballotTemplates[ballotTemplateId],
    allBallotProps,
    electionSerializationFormat
  );
  if (renderResult.isErr()) {
    return renderResult;
  }
  const { electionDefinition, ballotDocuments } = renderResult.ok();
  electionPackageZip.file(
    ElectionPackageFileName.ELECTION,
    electionDefinition.electionData
  );

  electionPackageZip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(systemSettings, null, 2)
  );

  const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
    appStrings,
    electionStrings,
    speechSynthesizer,
  });
  electionPackageZip.file(
    ElectionPackageFileName.AUDIO_IDS,
    JSON.stringify(uiStringAudioIds, null, 2)
  );
  electionPackageZip.file(
    ElectionPackageFileName.AUDIO_CLIPS,
    uiStringAudioClips
  );

  if (
    ballotTemplateId === 'NhBallotV3' ||
    ballotTemplateId === 'NhBallotV3Compact'
  ) {
    makeV3Compatible(electionPackageZip, systemSettings);
  }

  const electionPackageZipContents = await electionPackageZip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const electionPackageHash = sha256(electionPackageZipContents);

  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    electionPackageHash
  );
  const electionPackageFileName = `election-package-${combinedHash}.zip`;

  electionPackageZip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );

  combinedZip.file(electionPackageFileName, electionPackageZipContents);

  // Make ballot package zip
  for (const [props, document] of iter(allBallotProps).zip(ballotDocuments)) {
    const pdf = await document.renderToPdf();
    const { precinctId, ballotStyleId, ballotType, ballotMode } = props;
    const precinct = assertDefined(getPrecinctById({ election, precinctId }));
    const fileName = getPdfFileName(
      precinct.name,
      ballotStyleId,
      ballotType,
      ballotMode
    );
    ballotsZip.file(fileName, pdf);
  }

  const readinessReportPdf = await renderBallotStyleReadinessReport({
    componentProps: {
      electionDefinition,
      generatedAtTime: new Date(),
    },
    renderer,
  });

  // eslint-disable-next-line no-console
  renderer.cleanup().catch(console.error);

  ballotsZip.file(BALLOT_STYLE_READINESS_REPORT_FILE_NAME, readinessReportPdf);

  // Add ballot package to combined zip
  const ballotZipContents = await ballotsZip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const ballotZipFileName = `ballots-${formatBallotHash(
    electionDefinition.ballotHash
  )}.zip`;
  combinedZip.file(ballotZipFileName, ballotZipContents);

  // Write combined zip to file storage
  const combinedFileName = `election-package-and-ballots-${combinedHash}.zip`;
  const combinedZipContents = await combinedZip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const writeResult = await fileStorageClient.writeFile(
    path.join(orgId, combinedFileName),
    combinedZipContents
  );
  writeResult.unsafeUnwrap();
  const electionPackageUrl = `/files/${orgId}/${combinedFileName}`;

  await store.setElectionPackageUrl({
    electionId,
    electionPackageUrl,
  });

  return ok();
}
