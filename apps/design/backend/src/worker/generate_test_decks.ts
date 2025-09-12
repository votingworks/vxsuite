import {
  BallotType,
  ElectionId,
  ElectionSerializationFormat,
  formatBallotHash,
} from '@votingworks/types';
import { translateBallotStrings } from '@votingworks/backend';
import {
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  layOutBallotsAndCreateElectionDefinition,
} from '@votingworks/hmpb';
import { iter } from '@votingworks/basics';
import JsZip from 'jszip';
import path from 'node:path';
import { LogEventId } from '@votingworks/logging';
import { WorkerContext } from './context';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReport,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
} from '../test_decks';

export async function generateTestDecks(
  { logger, translator, workspace, fileStorageClient }: WorkerContext,
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
    election,
    ballotLanguageConfigs,
    ballotStyles,
    ballotTemplateId,
    orgId,
  } = await store.getElection(electionId);
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
    ballotStyles,
    compact
  );
  const testBallotProps = allBallotProps.filter(
    (props) =>
      props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
  );

  logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    electionId: election.id,
    message: `ballot props generated for ${testBallotProps.length} document(s)`,
    task: 'generate_test_decks',
  });

  const renderer = await createPlaywrightRenderer();
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      renderer,
      ballotTemplates[ballotTemplateId],
      testBallotProps,
      electionSerializationFormat
    );

  logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    electionId: election.id,
    message: `generated ballot layouts - generating test decks for ${election.precincts.length} precinct(s)`,
    task: 'generate_test_decks',
  });

  const ballots = iter(testBallotProps)
    .zip(ballotContents)
    .map(([props, contents]) => ({
      props,
      contents,
    }))
    .toArray();

  const zip = new JsZip();

  for (const precinct of election.precincts) {
    const testDeckPdf = await createPrecinctTestDeck({
      renderer,
      electionDefinition,
      precinctId: precinct.id,
      ballots,
      logger,
    });

    if (!testDeckPdf) continue;
    const fileName = `${precinct.name.replaceAll(' ', '_')}-test-ballots.pdf`;
    zip.file(fileName, testDeckPdf);
  }

  logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    electionId: election.id,
    message: 'generated final test deck PDFs',
    task: 'generate_test_decks',
  });

  const tallyReport = await createTestDeckTallyReport({ electionDefinition });

  logger.log(LogEventId.BackgroundTaskStatus, 'system', {
    electionId: election.id,
    message: 'generated tally report PDF',
    task: 'generate_test_decks',
  });

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
