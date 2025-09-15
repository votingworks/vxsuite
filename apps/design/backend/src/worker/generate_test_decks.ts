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
  { translator, workspace, fileStorageClient }: WorkerContext,
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
  const ballotLayoutSettings = await store.getBallotLayoutSettings(electionId);

  const ballotStrings = await translateBallotStrings(
    translator,
    election,
    hmpbStringsCatalog,
    ballotLanguageConfigs
  );
  const formattedElection = formatElectionForExport(election, ballotStrings);
  const { allBallotProps, ballotTemplate } = createBallotPropsForTemplate(
    ballotTemplateId,
    formattedElection,
    ballotStyles,
    ballotLayoutSettings
  );
  const testBallotProps = allBallotProps.filter(
    (props) =>
      props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
  );
  const renderer = await createPlaywrightRenderer();
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      renderer,
      ballotTemplate,
      testBallotProps,
      electionSerializationFormat
    );
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
    });

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
