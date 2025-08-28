import JsZip from 'jszip';
import path from 'node:path';
import {
  ElectionSerializationFormat,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  mergeUiStrings,
  formatElectionHashes,
  LATEST_METADATA,
  SystemSettings,
  MarkThresholds,
  AdjudicationReason,
  ElectionId,
  getPrecinctById,
  formatBallotHash,
  BallotType,
} from '@votingworks/types';
import {
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  ballotTemplates,
  BaseBallotProps,
  renderAllBallotPdfsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { assertDefined, find, iter, range } from '@votingworks/basics';
import { WorkerContext } from './context';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots';
import { getBallotPdfFileName } from '../utils';
import {
  normalizeBallotColorModeForPrinting,
  renderCalibrationSheetPdf,
} from './ballot_pdfs';

export interface V3SystemSettings {
  readonly auth: SystemSettings['auth'];
  readonly markThresholds: MarkThresholds;
  readonly adminAdjudicationReasons: readonly AdjudicationReason[];
  readonly centralScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly precinctScanAdjudicationReasons: readonly AdjudicationReason[];
  readonly precinctScanDisallowCastingOvervotes: boolean;
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
    shouldExportAudio,
    numAuditIdBallots,
  }: {
    electionId: ElectionId;
    electionSerializationFormat: ElectionSerializationFormat;
    shouldExportAudio: boolean;
    numAuditIdBallots?: number;
  }
): Promise<void> {
  const { store } = workspace;

  const electionRecord = await store.getElection(electionId);
  const {
    ballotLanguageConfigs,
    election,
    ballotStyles,
    ballotTemplateId,
    orgId,
  } = electionRecord;
  let { systemSettings } = electionRecord;
  const { compact } = await store.getBallotLayoutSettings(electionId);

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

  const formattedElection = formatElectionForExport(election, ballotStrings);

  let allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    formattedElection,
    ballotStyles,
    compact
  );

  // If we're exporting ballots with ballot audit IDs...
  if (numAuditIdBallots) {
    // Turn on the system setting so VxScan knows to expect ballot audit IDs.
    systemSettings = {
      ...electionRecord.systemSettings,
      precinctScanEnableBallotAuditIds: true,
    };

    // Instead of generating one of each combo of ballot style/precinct/ballot
    // type/ballot mode, just pick one and generate a ballot PDF for each audit
    // ballot ID. For now, we're just testing this feature, so we don't need
    // every combo.
    const officialPrecinctBallotProps = find(
      allBallotProps,
      (props) =>
        props.ballotMode === 'official' &&
        props.ballotType === BallotType.Precinct
    );
    allBallotProps = range(1, numAuditIdBallots + 1).map(
      (ballotIndex): BaseBallotProps => ({
        ...officialPrecinctBallotProps,
        ballotAuditId: String(ballotIndex),
      })
    );
  }

  const renderer = await createPlaywrightRenderer();
  const { electionDefinition, ballotPdfs } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      renderer,
      ballotTemplates[ballotTemplateId],
      allBallotProps,
      electionSerializationFormat
    );
  electionPackageZip.file(
    ElectionPackageFileName.ELECTION,
    electionDefinition.electionData
  );

  electionPackageZip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(systemSettings, null, 2)
  );

  if (shouldExportAudio) {
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

  // Make ballot zip
  for (const [props, ballotPdf] of iter(allBallotProps).zip(ballotPdfs)) {
    const { precinctId, ballotStyleId, ballotType, ballotMode, ballotAuditId } =
      props;
    const precinct = assertDefined(getPrecinctById({ election, precinctId }));
    const fileName = getBallotPdfFileName(
      precinct.name,
      ballotStyleId,
      ballotType,
      ballotMode,
      ballotAuditId
    );
    const normalizedColorPdf = await normalizeBallotColorModeForPrinting(
      ballotPdf,
      props
    );
    ballotsZip.file(fileName, normalizedColorPdf);
  }
  const calibrationSheetPdf = await renderCalibrationSheetPdf(
    renderer,
    election.ballotLayout.paperSize
  );
  ballotsZip.file('VxScan-calibration-sheet.pdf', calibrationSheetPdf);

  // eslint-disable-next-line no-console
  renderer.cleanup().catch(console.error);

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
}
