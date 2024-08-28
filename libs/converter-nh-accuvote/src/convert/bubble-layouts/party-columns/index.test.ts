import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { assert, iter } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireHudsonFixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import { SheetOf } from '@votingworks/types';
import { ImageData } from 'canvas';
import { matchBubblesAndContestOptionsUsingPartyColumns } from '.';
import * as accuvote from '../../accuvote';
import { parseXml } from '../../dom_parser';

test('match party columns (Hudson)', async () => {
  const templateImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImageData(),
  ];
  const definition = accuvote
    .parseXml(
      parseXml(
        electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
      )
    )
    .unsafeUnwrap();
  const gridsAndBubbles =
    findTemplateGridAndBubbles(templateImages).unsafeUnwrap();
  const matchResult = matchBubblesAndContestOptionsUsingPartyColumns({
    definition,
    gridsAndBubbles,
  }).unsafeUnwrap();

  expect(matchResult.unmatched).toHaveLength(0);

  for (const contest of definition.candidates) {
    for (const candidate of contest.candidateNames) {
      const match = iter(matchResult.matched)
        .flatMap((matches) => matches)
        .find((m) => m.type === 'candidate' && m.candidate === candidate);

      assert(match, `No match for ${candidate.name}`);
    }
  }
});

test('match party columns (Test Ballot)', async () => {
  const templateImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireTestBallotFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.templateBack.asImageData(),
  ];
  const definition = accuvote
    .parseXml(
      parseXml(
        electionGridLayoutNewHampshireTestBallotFixtures.correctedDefinitionXml.asText()
      )
    )
    .unsafeUnwrap();
  const gridsAndBubbles =
    findTemplateGridAndBubbles(templateImages).unsafeUnwrap();
  const matchResult = matchBubblesAndContestOptionsUsingPartyColumns({
    definition,
    gridsAndBubbles,
  }).unsafeUnwrap();

  expect(matchResult.unmatched).toHaveLength(0);

  for (const contest of definition.candidates) {
    for (const candidate of contest.candidateNames) {
      const match = iter(matchResult.matched)
        .flatMap((matches) => matches)
        .find((m) => m.type === 'candidate' && m.candidate === candidate);

      assert(match, `No match for ${candidate.name}`);
    }
  }
});

test('match party columns (Test Ballot uncorrected)', async () => {
  const templateImages: SheetOf<ImageData> = [
    await electionGridLayoutNewHampshireTestBallotFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.templateBack.asImageData(),
  ];
  const definition = accuvote
    .parseXml(
      parseXml(
        electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
      )
    )
    .unsafeUnwrap();
  const gridsAndBubbles =
    findTemplateGridAndBubbles(templateImages).unsafeUnwrap();
  const matchResult = matchBubblesAndContestOptionsUsingPartyColumns({
    definition,
    gridsAndBubbles,
  }).unsafeUnwrap();

  expect(matchResult.unmatched).toHaveLength(0);

  for (const contest of definition.candidates) {
    for (const candidate of contest.candidateNames) {
      const match = iter(matchResult.matched)
        .flatMap((matches) => matches)
        .find((m) => m.type === 'candidate' && m.candidate === candidate);

      assert(match, `No match for ${candidate.name}`);
    }
  }
});
