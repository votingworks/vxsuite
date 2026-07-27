import { assert, assertDefined } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  ballotTemplates,
  createPlaywrightRendererPool,
  layOutBallotsAndCreateElectionDefinition,
  markBallotDocument,
  rcvDemoBallotFixtures,
  rcvDemoContestId,
  renderBallotPdfWithMetadataQrCode,
} from '@votingworks/hmpb';
import {
  AdjudicationReason,
  asSheet,
  CandidateContest,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  LATEST_SOFTWARE_VERSION,
  PageInterpretation,
  VotesDict,
} from '@votingworks/types';
import { expect, test } from 'vitest';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { interpretSheet } from './interpret';
import { InterpreterOptions } from './types';

function interpreterOptions(
  electionDefinition: ElectionDefinition
): InterpreterOptions {
  return {
    electionDefinition,
    validPrecinctIds: new Set([
      assertDefined(electionDefinition.election.precincts[0]).id,
    ]),
    // The demo fixtures are official-mode ballots
    testMode: false,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [AdjudicationReason.Overvote],
  };
}

function voteIds(interpretation: PageInterpretation): Record<string, string[]> {
  assert(interpretation.type === 'InterpretedHmpbPage');
  return Object.fromEntries(
    Object.entries(interpretation.votes).map(([contestId, votes]) => [
      contestId,
      assertDefined(votes).map((vote) =>
        typeof vote === 'string' ? vote : vote.id
      ),
    ])
  );
}

test('marked fixture ballot: one candidate ranked per rank contest', async () => {
  const electionDefinition = (
    await readElection(rcvDemoBallotFixtures.electionPath)
  ).unsafeUnwrap();
  const images = asSheet(
    await pdfToPageImages(rcvDemoBallotFixtures.markedBallotPath).toArray()
  );

  const [frontResult, backResult] = await interpretSheet(
    interpreterOptions(electionDefinition),
    images
  );

  assert(frontResult.type === 'InterpretedHmpbPage');
  assert(backResult.type === 'InterpretedHmpbPage');
  expect(voteIds(frontResult)).toEqual({
    [rcvDemoContestId(1)]: ['neysa-fligor'],
    [rcvDemoContestId(2)]: ['rishi-kumar'],
    [rcvDemoContestId(3)]: ['yan-zhao'],
    [rcvDemoContestId(4)]: ['bryan-do'],
  });
  expect(frontResult.adjudicationInfo.enabledReasonInfos).toEqual([]);
  expect(frontResult.adjudicationInfo.requiresAdjudication).toEqual(false);
}, 30_000);

test('rank semantics: repeat ranking is not an overvote, two marks in one rank is, write-ins interpret per rank', async () => {
  const { allBallotProps } = rcvDemoBallotFixtures;
  const blankBallotProps = assertDefined(allBallotProps[0]);
  const { election } = blankBallotProps;
  const [rank1, rank2, rank3, rank4] = election.contests as CandidateContest[];
  assert(rank1 && rank2 && rank3 && rank4);
  const [fligor, kumar] = rank1.candidates;
  assert(fligor && kumar);

  const votes: VotesDict = {
    // The same candidate ranked 1st and 2nd — independent contests, so this
    // must NOT be an overvote
    [rank1.id]: [fligor],
    [rank2.id]: [fligor],
    // Two marks in the 3rd Choice column — an overvote of that rank's
    // vote-for-1 contest
    [rank3.id]: [fligor, kumar],
    [rank4.id]: [kumar],
  };

  const rendererPool = await createPlaywrightRendererPool();
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.CaBallot,
      allBallotProps,
      { format: 'vxf', version: LATEST_SOFTWARE_VERSION }
    );
  const markedBallotPdf = await rendererPool.runTask(async (renderer) => {
    const ballotDocument = await renderer.loadDocumentFromContent(
      assertDefined(ballotContents[0])
    );
    await renderBallotPdfWithMetadataQrCode(
      blankBallotProps,
      ballotDocument,
      electionDefinition,
      LATEST_SOFTWARE_VERSION
    );
    await markBallotDocument(ballotDocument, votes);
    return await ballotDocument.renderToPdf();
  });
  await rendererPool.close();

  const images = asSheet(await pdfToPageImages(markedBallotPdf).toArray());
  const [frontResult, backResult] = await interpretSheet(
    interpreterOptions(electionDefinition),
    images
  );

  assert(frontResult.type === 'InterpretedHmpbPage');
  assert(backResult.type === 'InterpretedHmpbPage');
  expect(voteIds(frontResult)).toEqual({
    [rank1.id]: [fligor.id],
    [rank2.id]: [fligor.id],
    [rank3.id]: [fligor.id, kumar.id],
    [rank4.id]: [kumar.id],
  });

  // Only the double-marked rank contest is overvoted
  expect(frontResult.adjudicationInfo.enabledReasonInfos).toEqual([
    {
      type: AdjudicationReason.Overvote,
      contestId: rank3.id,
      optionIds: [fligor.id, kumar.id],
      expected: 1,
    },
  ]);
}, 60_000);
