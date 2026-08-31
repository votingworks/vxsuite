import {
  BallotType,
  ElectionId,
  ElectionIdSchema,
  ElectionSerializationFormat,
  ElectionSerializationFormatSchema,
  formatBallotHash,
  Precinct,
} from '@votingworks/types';
import { translateBallotStrings } from '@votingworks/backend';
import {
  ballotTemplates,
  createPlaywrightRendererPool,
  ElectionSerializationOptions,
  hmpbStringsCatalog,
  layOutBallotsAndCreateElectionDefinition,
  RendererPool,
  ScratchDir,
} from '@votingworks/hmpb';
import { iter } from '@votingworks/basics';
import JsZip from 'jszip';
import path from 'node:path';
import z from 'zod/v4';
import {
  generateTestDeckBallots,
  TestDeckBallot,
  createSummaryBallotTestDeck,
} from '@votingworks/test-decks';
import { EmitProgressFunction, WorkerContext } from './context.js';
import {
  addPollingPlacesForExport,
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots.js';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReports,
} from '../test_decks.js';

export interface GenerateTestDecksPayload {
  electionId: ElectionId;
  electionSerializationFormat: ElectionSerializationFormat;
}

export const GenerateTestDecksPayloadSchema: z.ZodType<GenerateTestDecksPayload> =
  z.object({
    electionId: ElectionIdSchema,
    electionSerializationFormat: ElectionSerializationFormatSchema,
  });

export async function generateTestDecks(
  ctx: WorkerContext,
  payload: GenerateTestDecksPayload,
  emitProgress: EmitProgressFunction,
  scratchDir: ScratchDir
): Promise<void> {
  const rendererPool = await createPlaywrightRendererPool();

  try {
    await generate(ctx, payload, rendererPool, emitProgress, scratchDir);
  } finally {
    // eslint-disable-next-line no-console
    rendererPool.close().catch(console.error);
  }
}

async function generate(
  { translator, workspace, fileStorageClient }: WorkerContext,
  { electionId, electionSerializationFormat }: GenerateTestDecksPayload,
  rendererPool: RendererPool,
  emitProgress: EmitProgressFunction,
  scratchDir: ScratchDir
): Promise<void> {
  const { store } = workspace;
  const electionRecord = await store.getElection(electionId);
  const {
    ballotLanguageConfigs,
    ballotTemplateId,
    jurisdictionId,
    systemSettings,
  } = electionRecord;
  const jurisdiction = await store.getJurisdiction(jurisdictionId);
  // Currently, we don't support generating BMD ballots with v4.0 QR code
  // encoding, so we can't generate test decks targeting v4.0. If we end up
  // needing to support this, we can add that support back in.
  if (jurisdiction.softwareVersion === 'v4.0') {
    throw new Error(
      'Test deck generation is not supported for software version v4.0'
    );
  }
  const election = addPollingPlacesForExport(
    electionRecord.election,
    jurisdiction,
    systemSettings
  );
  const { compact } = await store.getBallotLayoutSettings(electionId);

  // Check if summary BMD ballots should be generated
  const shouldGenerateSummaryBallots =
    systemSettings.bmdPrintMode === 'summary' ||
    systemSettings.bmdPrintMode === undefined;

  const ballotStrings = await translateBallotStrings(
    translator,
    election,
    hmpbStringsCatalog,
    ballotLanguageConfigs
  );
  const formattedElection = formatElectionForExport(election, ballotStrings);
  const allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    formattedElection,
    compact
  );
  const testBallotProps = allBallotProps.filter(
    (props) =>
      props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
  );
  const serializationOptions: ElectionSerializationOptions = {
    format: electionSerializationFormat,
    version: jurisdiction.softwareVersion,
  };

  const { electionDefinition, layoutPaths } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates[ballotTemplateId],
      testBallotProps,
      serializationOptions,
      scratchDir,
      emitProgress
    );

  const ballots = iter(testBallotProps)
    .zip(layoutPaths)
    .map(([props, layoutPath]) => ({ props, layoutPath }))
    .toArray();

  const zip = new JsZip();

  // Generate HMPB test deck ballot specs
  const precinctHmpbBallotSpecs: Array<[Precinct, TestDeckBallot[]]> =
    election.precincts.map((precinct) => [
      precinct,
      generateTestDeckBallots({
        election,
        precinctId: precinct.id,
        ballotFormat: 'bubble',
      }),
    ]);

  // Generate summary ballot specs if configured
  const precinctSummaryBallotSpecs: Array<[Precinct, TestDeckBallot[]]> =
    shouldGenerateSummaryBallots
      ? election.precincts.map((precinct) => [
          precinct,
          generateTestDeckBallots({
            election,
            precinctId: precinct.id,
            ballotFormat: 'summary',
          }),
        ])
      : [];

  // Calculate total ballots
  const hmpbBallotCount = iter(precinctHmpbBallotSpecs)
    .map(([, specs]) => specs.length)
    .sum();
  const summaryBallotCount = iter(precinctSummaryBallotSpecs)
    .map(([, specs]) => specs.length)
    .sum();
  const totalTestDeckBallots = hmpbBallotCount + summaryBallotCount;
  emitProgress('Rendering test decks', 0, totalTestDeckBallots);
  let renderedBallots = 0;

  for (const [precinct, ballotSpecs] of precinctHmpbBallotSpecs) {
    // Generate HMPB test deck
    const testDeckPdf = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs,
      ballots,
      // eslint-disable-next-line no-loop-func
      emitProgress: (ballotsRendered) => {
        emitProgress(
          `Rendering test decks`,
          renderedBallots + ballotsRendered,
          totalTestDeckBallots
        );
      },
    });
    renderedBallots += ballotSpecs.length;
    /* istanbul ignore else */
    if (testDeckPdf) {
      const fileName = `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`;
      zip.file(fileName, testDeckPdf);
    }
  }

  // Generate summary BMD ballot test decks if configured
  for (const [precinct, ballotSpecs] of precinctSummaryBallotSpecs) {
    const summaryBallotPdf = await createSummaryBallotTestDeck({
      electionDefinition,
      ballotSpecs,
      isLiveMode: false, // Test decks are always in test mode
      // eslint-disable-next-line no-loop-func
      emitProgress: (ballotsRendered) => {
        emitProgress(
          `Rendering test decks`,
          renderedBallots + ballotsRendered,
          totalTestDeckBallots
        );
      },
    });
    renderedBallots += ballotSpecs.length;
    /* istanbul ignore else */
    if (summaryBallotPdf) {
      const summaryFileName = `${precinct.name.replaceAll(
        ' ',
        '_'
      )}-summary-ballots.pdf`;
      zip.file(summaryFileName, summaryBallotPdf);
    }
  }

  const tallyReports = await createTestDeckTallyReports({
    electionDefinition,
    includeSummaryBallots: shouldGenerateSummaryBallots,
  });

  for (const [fileName, report] of tallyReports) {
    zip.file(fileName, report);
  }
  const zipContents = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFilename = `test-decks-${formatBallotHash(
    electionDefinition.ballotHash
  )}.zip`;

  const writeResult = await fileStorageClient.writeFile(
    path.join(jurisdictionId, zipFilename),
    zipContents
  );
  writeResult.unsafeUnwrap();
  const testDecksUrl = `/files/${jurisdictionId}/${zipFilename}`;

  await store.setTestDecksUrl({
    electionId,
    testDecksUrl,
  });
}
