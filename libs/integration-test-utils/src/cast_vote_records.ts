import {
  computeCastVoteRecordRootHashFromScratch,
  prepareSignatureFile,
} from '@votingworks/auth';
import { assert, assertDefined, groupBy } from '@votingworks/basics';
import {
  buildBatchManifest,
  buildCastVoteRecord,
  buildCastVoteRecordReportMetadata,
} from '@votingworks/backend';
import { interpretSheetAndSaveImages } from '@votingworks/ballot-interpreter';
import { type MarginalMark } from '@votingworks/hmpb';
import { pdfToImages, type ImageData } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  BallotId,
  BallotIdSchema,
  BallotStyleId,
  BallotType,
  BatchInfo,
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CVR,
  DEFAULT_MARK_THRESHOLDS_MARGINAL_MARK_ADJUDICATION_ENABLED,
  DEV_MACHINE_ID,
  ElectionDefinition,
  InterpretedHmpbPage,
  mapSheet,
  PrecinctId,
  SheetOf,
  unsafeParse,
  VotesDict,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { basename, join, parse } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { renderMarkedBallots } from './ballots';

/** Specifies a single ballot to include in a generated cast vote record export. */
export interface CastVoteRecordSpec {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  votes: VotesDict;
  /** Precinct (default) or absentee — determines the CVR's voting method. */
  ballotType?: BallotType;
  /** Partial marks on unvoted options, to simulate marginal marks. */
  marginalMarks?: MarginalMark[];
}

/** Options for {@link generateCastVoteRecordExport}. */
export interface GenerateCastVoteRecordExportOptions {
  /** Scanner/device id recorded on each CVR. Defaults to {@link DEV_MACHINE_ID}. */
  scannerId?: string;
  /** Whether the export is a test-mode export. Defaults to `false`. */
  testMode?: boolean;
}

const BATCH_NUMBER = 1;

function sha256Hex(contents: Buffer | string): string {
  return sha256(contents);
}

function restoreEnv(key: string, priorValue?: string): void {
  if (priorValue === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = priorValue;
  }
}

/**
 * Renders a single sheet's marked ballot, interprets it the same way a scanner
 * would, and writes the resulting images, layout files, and CVR report into
 * `castVoteRecordDirectory`. Returns the built CVR so the caller can assemble
 * the export metadata.
 */
async function renderInterpretAndWriteCvr({
  electionDefinition,
  spec,
  scannerId,
  batchId,
  testMode,
  pdfPath,
  castVoteRecordId,
  castVoteRecordDirectory,
}: {
  electionDefinition: ElectionDefinition;
  spec: CastVoteRecordSpec;
  scannerId: string;
  batchId: string;
  testMode: boolean;
  pdfPath: string;
  castVoteRecordId: BallotId;
  castVoteRecordDirectory: string;
}): Promise<CVR.CVR> {
  const pdfBytes = new Uint8Array(await fs.readFile(pdfPath));
  const pageImages: ImageData[] = [];
  for await (const { page } of pdfToImages(pdfBytes, { scale: 200 / 72 })) {
    pageImages.push(page);
    if (pageImages.length === 2) break;
  }
  // This helper only supports single-sheet ballots, which covers the election
  // fixtures used in integration tests. Fail fast rather than silently dropping
  // contests on later sheets.
  assert(
    pageImages.length === 2,
    `expected a 2-page (single-sheet) ballot, got ${pageImages.length} page(s)`
  );
  const sheet: SheetOf<ImageData> = [
    assertDefined(pageImages[0]),
    assertDefined(pageImages[1]),
  ];

  await fs.mkdir(castVoteRecordDirectory, { recursive: true });
  const interpretations = await interpretSheetAndSaveImages(
    {
      electionDefinition,
      validPrecinctIds: new Set(
        electionDefinition.election.precincts.map((precinct) => precinct.id)
      ),
      testMode,
      adjudicationReasons: [
        AdjudicationReason.Overvote,
        AdjudicationReason.Undervote,
        AdjudicationReason.BlankBallot,
        AdjudicationReason.MarginalMark,
      ],
      markThresholds:
        DEFAULT_MARK_THRESHOLDS_MARGINAL_MARK_ADJUDICATION_ENABLED,
    },
    sheet,
    castVoteRecordId,
    castVoteRecordDirectory
  );

  const hmpbInterpretations: SheetOf<InterpretedHmpbPage> = mapSheet(
    interpretations,
    ({ interpretation }) => {
      assert(
        interpretation.type === 'InterpretedHmpbPage',
        `expected InterpretedHmpbPage but got ${interpretation.type} for ` +
          `ballot style ${spec.ballotStyleId} in precinct ${spec.precinctId}`
      );
      return interpretation;
    }
  );

  const images = await mapSheet(
    interpretations,
    hmpbInterpretations,
    async ({ imagePath }, { layout }) => {
      const { dir, name } = parse(imagePath);
      const layoutFilePath = join(dir, `${name}.layout.json`);
      const layoutFileContents = JSON.stringify(layout);
      await fs.writeFile(layoutFilePath, layoutFileContents);
      return {
        imageHash: sha256Hex(await fs.readFile(imagePath)),
        imageRelativePath: basename(imagePath),
        layoutFileHash: sha256Hex(layoutFileContents),
      };
    }
  );

  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId: electionDefinition.ballotHash,
    scannerId,
    castVoteRecordId,
    batchId,
    ballotMarkingMode: 'hand',
    interpretations: hmpbInterpretations,
    images,
    markThresholds: DEFAULT_MARK_THRESHOLDS_MARGINAL_MARK_ADJUDICATION_ENABLED,
  });

  return castVoteRecord;
}

/**
 * Generates a cast vote record export directory from a list of ballot specs,
 * mirroring what a scanner produces: each ballot is rendered with the requested
 * votes, interpreted to obtain real ballot images and layout coordinates, and
 * written out as a CVR with referenced image and layout files. The export
 * includes the metadata and signature files required for VxAdmin to import it.
 *
 * Unlike the static `generate-cvrs` fixtures, the votes are fully
 * caller-controlled and the images and layouts are real, so write-in and
 * adjudication contexts that crop the ballot image render correctly.
 *
 * `electionDefinition` must be laid out with the `VxDefaultBallot` template
 * (which {@link renderMarkedBallots} uses to render), so that the rendered
 * ballots interpret cleanly against the election's grid layouts — e.g.
 * `electionFamousNames2021Fixtures`. Only single-sheet ballots are supported.
 *
 * Returns the path to the generated export directory.
 */
export async function generateCastVoteRecordExport(
  electionDefinition: ElectionDefinition,
  ballots: CastVoteRecordSpec[],
  options: GenerateCastVoteRecordExportOptions = {}
): Promise<string> {
  const scannerId = options.scannerId ?? DEV_MACHINE_ID;
  const testMode = options.testMode ?? false;
  const { election, ballotHash } = electionDefinition;

  const exportDirectory = join(
    mkdtempSync(join(tmpdir(), 'cvr-export-')),
    `machine_${scannerId}__2024-01-01_00-00-00`
  );
  await fs.mkdir(exportDirectory, { recursive: true });

  // `renderMarkedBallots` shares a single layout pass per call, so all ballots
  // in a call must share ballot style and precinct. Group accordingly while
  // keeping a stable scanner-wide ballot order.
  const ballotMode = testMode ? 'test' : 'official';
  const groups = groupBy(
    ballots,
    (ballot) =>
      `${ballot.ballotStyleId}|${ballot.precinctId}|${
        ballot.ballotType ?? BallotType.Precinct
      }`
  );

  const batchId = sha256(scannerId).slice(0, 8);
  const batches: BatchInfo[] = [
    {
      id: batchId,
      batchNumber: BATCH_NUMBER,
      label: batchId,
      startedAt: new Date().toISOString(),
      count: ballots.length,
    },
  ];
  const reportMetadata = buildCastVoteRecordReportMetadata({
    election,
    electionId: ballotHash,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: testMode,
    batchInfo: batches,
  });

  for (const [, groupBallots] of groups) {
    const pdfPaths = await renderMarkedBallots(
      groupBallots.map((ballot) => ({
        electionDefinition,
        ballotStyleId: ballot.ballotStyleId,
        precinctId: ballot.precinctId,
        votes: ballot.votes,
        ballotType: ballot.ballotType,
        marginalMarks: ballot.marginalMarks,
        ballotMode,
      }))
    );

    for (const [i, spec] of groupBallots.entries()) {
      const pdfPath = assertDefined(pdfPaths[i]);
      const castVoteRecordId = unsafeParse(BallotIdSchema, randomUUID());
      const castVoteRecordDirectory = join(exportDirectory, castVoteRecordId);
      const castVoteRecord = await renderInterpretAndWriteCvr({
        electionDefinition,
        spec,
        scannerId,
        batchId,
        testMode,
        pdfPath,
        castVoteRecordId,
        castVoteRecordDirectory,
      });

      await fs.writeFile(
        join(
          castVoteRecordDirectory,
          CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
        ),
        JSON.stringify({ ...reportMetadata, CVR: [castVoteRecord] })
      );
    }
  }
  const metadata: CastVoteRecordExportMetadata = {
    arePollsClosed: true,
    castVoteRecordReportMetadata: reportMetadata,
    castVoteRecordRootHash:
      await computeCastVoteRecordRootHashFromScratch(exportDirectory),
    batchManifest: buildBatchManifest({ scannerId, batches }),
  };
  const metadataFileContents = JSON.stringify(metadata);
  await fs.writeFile(
    join(exportDirectory, CastVoteRecordExportFileName.METADATA),
    metadataFileContents
  );

  // `prepareSignatureFile` reads machine type and cert config from the
  // environment. Force the integration-test (dev cert) context so a valid
  // signature is produced regardless of the caller's NODE_ENV — production dev
  // certs are the only ones available in tests. Restore the prior env so this
  // helper doesn't leak global state into the rest of the process.
  const priorMachineType = process.env['VX_MACHINE_TYPE'];
  const priorIsIntegrationTest = process.env['IS_INTEGRATION_TEST'];
  process.env['VX_MACHINE_TYPE'] = 'scan';
  process.env['IS_INTEGRATION_TEST'] = 'TRUE';
  try {
    const signatureFile = await prepareSignatureFile({
      type: 'cast_vote_records',
      context: 'export',
      directoryName: basename(exportDirectory),
      metadataFileContents,
    });
    await fs.writeFile(
      join(parse(exportDirectory).dir, signatureFile.fileName),
      signatureFile.fileContents
    );
  } finally {
    restoreEnv('VX_MACHINE_TYPE', priorMachineType);
    restoreEnv('IS_INTEGRATION_TEST', priorIsIntegrationTest);
  }

  return exportDirectory;
}
