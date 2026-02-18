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
  hmpbStringsCatalog,
  layOutBallotsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import { iter } from '@votingworks/basics';
import JsZip from 'jszip';
import path from 'node:path';
import z from 'zod/v4';
import { generateTestDeckBallots, TestDeckBallot } from '@votingworks/utils';
import { EmitProgressFunction, WorkerContext } from './context';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots';
import { getStateFeaturesConfig } from '../features';
import { injectStraightPartyContest } from '../straight_party';
import {
  createPrecinctTestDeck,
  createPrecinctSummaryBallotTestDeck,
  createTestDeckTallyReports,
} from '../test_decks';

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
  { translator, workspace, fileStorageClient }: WorkerContext,
  { electionId, electionSerializationFormat }: GenerateTestDecksPayload,
  emitProgress: EmitProgressFunction
): Promise<void> {
  const { store } = workspace;
  const electionRecord = await store.getElection(electionId);
  const {
    ballotLanguageConfigs,
    ballotTemplateId,
    jurisdictionId,
    systemSettings,
  } = electionRecord;
  const { compact } = await store.getBallotLayoutSettings(electionId);

  const jurisdiction = await store.getJurisdiction(jurisdictionId);
  const stateFeatures = getStateFeaturesConfig(jurisdiction);
  const election = stateFeatures.STRAIGHT_PARTY_VOTING
    ? injectStraightPartyContest(electionRecord.election)
    : electionRecord.election;

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
  const rendererPool = await createPlaywrightRendererPool();
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates[ballotTemplateId],
      testBallotProps,
      electionSerializationFormat,
      emitProgress
    );
  const ballots = iter(testBallotProps)
    .zip(ballotContents)
    .map(([props, contents]) => ({
      props,
      contents,
    }))
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
    /* istanbul ignore else - @preserve */
    if (testDeckPdf) {
      const fileName = `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`;
      zip.file(fileName, testDeckPdf);
    }
  }

  // Generate summary BMD ballot test decks if configured
  for (const [precinct, ballotSpecs] of precinctSummaryBallotSpecs) {
    const summaryBallotPdf = await createPrecinctSummaryBallotTestDeck({
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
    /* istanbul ignore else - @preserve */
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
