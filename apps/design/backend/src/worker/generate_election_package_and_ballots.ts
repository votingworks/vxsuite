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
} from '@votingworks/types';
import {
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  ballotTemplates,
  renderAllBallotsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import { assertDefined, iter } from '@votingworks/basics';
import { tmpNameSync } from 'tmp';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { createReadStream, createWriteStream, ReadStream } from 'node:fs';
import { Buffer } from 'node:buffer';
import { WorkerContext } from './context';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots';
import { renderBallotStyleReadinessReport } from '../ballot_style_reports';
import { getPdfFileName } from '../utils';

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

/**
 * Given a PDF document, convert it to grayscale and return a read stream to
 * the resulting PDF.
 */
async function convertPdfToGrayscale(pdf: Buffer): Promise<ReadStream> {
  const tmpPdfFilePath = tmpNameSync();
  const fileStream = createWriteStream(tmpPdfFilePath);
  fileStream.write(pdf);
  fileStream.end();
  const tmpGrayscalePdfFilePath = tmpNameSync();
  await promisify(exec)(`
    gs \
      -sOutputFile=${tmpGrayscalePdfFilePath} \
      -sDEVICE=pdfwrite \
      -sColorConversionStrategy=Gray \
      -dProcessColorModel=/DeviceGray \
      -dNOPAUSE \
      -dBATCH \
      ${tmpPdfFilePath}
  `);
  return createReadStream(tmpGrayscalePdfFilePath);
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
  }: {
    electionId: ElectionId;
    electionSerializationFormat: ElectionSerializationFormat;
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
    orgId,
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
      ballotLanguageConfigs,
      precincts
    );

  electionPackageZip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );
  const ballotStrings = mergeUiStrings(electionStrings, hmpbStrings);

  const formattedElection = formatElectionForExport(
    election,
    ballotStrings,
    precincts
  );

  const allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    formattedElection,
    precincts,
    ballotStyles
  );

  const renderer = await createPlaywrightRenderer();
  const { electionDefinition, ballotDocuments } =
    await renderAllBallotsAndCreateElectionDefinition(
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

  const isCloudTranslationAndSpeechSynthesisEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
  );
  const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
    isCloudTranslationAndSpeechSynthesisEnabled,
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

  // Make ballot zip
  for (const [props, document] of iter(allBallotProps).zip(ballotDocuments)) {
    const colorPdf = await document.renderToPdf();
    const grayscalePdf = await convertPdfToGrayscale(colorPdf);
    const { precinctId, ballotStyleId, ballotType, ballotMode } = props;
    const precinct = assertDefined(getPrecinctById({ election, precinctId }));
    const fileName = getPdfFileName(
      precinct.name,
      ballotStyleId,
      ballotType,
      ballotMode
    );
    ballotsZip.file(fileName, grayscalePdf);
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
}
