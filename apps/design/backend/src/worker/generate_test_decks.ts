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
import {
  createPrecinctTestDeck,
  createTestDeckTallyReport,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
} from '../test_decks';

interface GenerateTestDecksPayload {
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
  const { election, ballotLanguageConfigs, ballotTemplateId, orgId } =
    await store.getElection(electionId);
  const { compact } = await store.getBallotLayoutSettings(electionId);

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

  const precinctBallotSpecs: Array<[Precinct, TestDeckBallot[]]> =
    election.precincts.map((precinct) => [
      precinct,
      generateTestDeckBallots({
        election,
        precinctId: precinct.id,
        markingMethod: 'hand',
      }),
    ]);

  const totalTestDeckBallots = iter(precinctBallotSpecs)
    .map(([, specs]) => specs.length)
    .sum();
  emitProgress('Rendering test decks', 0, totalTestDeckBallots);
  let renderedBallots = 0;
  for (const [precinct, ballotSpecs] of precinctBallotSpecs) {
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
    if (!testDeckPdf) continue;
    const fileName = `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`;
    zip.file(fileName, testDeckPdf);
  }

  const tallyReport = await createTestDeckTallyReport({ electionDefinition });

  zip.file(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME, tallyReport);
  const zipContents = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFilename = `test-decks-${formatBallotHash(
    electionDefinition.ballotHash
  )}.zip`;

  const writeResult = await fileStorageClient.writeFile(
    path.join(orgId, zipFilename),
    zipContents
  );
  writeResult.unsafeUnwrap();
  const testDecksUrl = `/files/${orgId}/${zipFilename}`;

  await store.setTestDecksUrl({
    electionId,
    testDecksUrl,
  });
}
