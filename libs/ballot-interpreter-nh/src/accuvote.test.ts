import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/basics';
import {
  readFixtureBallotCardDefinition,
  readFixtureImage,
} from '../test/fixtures';
import { asciiOvalGrid, testImageDebugger } from '../test/utils';
import {
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
  findTemplateOvals,
  ScannedBallotCardGeometry8pt5x14,
  TemplateBallotCardGeometry8pt5x14,
} from './accuvote';
import { pairColumnEntries, readGridFromElectionDefinition } from './convert';
import * as templates from './data/templates';
import { interpretBallotCardLayout } from './interpret/interpret_ballot_card_layout';
import {
  decodeBottomRowTimingMarks,
  interpolateMissingTimingMarks,
  renderTimingMarks,
} from './timing_marks';
import {
  BackMarksMetadata,
  BackMarksMetadataSchema,
  FrontMarksMetadata,
  FrontMarksMetadataSchema,
} from './types';

test('hudson template', async () => {
  const hudson = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImage(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImage(),
    TemplateBallotCardGeometry8pt5x14
  );
  const frontDebug = testImageDebugger(hudson.front);
  const backDebug = testImageDebugger(hudson.back);
  const frontLayout = frontDebug.capture('front timing marks', () =>
    interpretBallotCardLayout(hudson.front, {
      geometry: TemplateBallotCardGeometry8pt5x14,
      debug: frontDebug,
    })
  );
  if (!frontLayout) {
    return;
  }
  const backLayout = backDebug.capture('back timing marks', () =>
    interpretBallotCardLayout(hudson.back, {
      geometry: TemplateBallotCardGeometry8pt5x14,
      debug: backDebug,
    })
  );
  const frontTimingMarks = frontLayout.partialTimingMarks;
  const backTimingMarks = backLayout.partialTimingMarks;
  assert(frontTimingMarks && backTimingMarks, 'findTimingMarks failed');

  const { gridSize } = TemplateBallotCardGeometry8pt5x14;
  expect(frontTimingMarks.topLeft).toBeDefined();
  expect(frontTimingMarks.topRight).toBeDefined();
  expect(frontTimingMarks.bottomLeft).toBeDefined();
  expect(frontTimingMarks.bottomRight).toBeDefined();
  expect(frontTimingMarks.left).toHaveLength(gridSize.height);
  expect(frontTimingMarks.right).toHaveLength(gridSize.height);
  expect(frontTimingMarks.top).toHaveLength(gridSize.width);
  expect(frontTimingMarks.bottom).toHaveLength(12);

  expect(backTimingMarks.topLeft).toBeDefined();
  expect(backTimingMarks.topRight).toBeDefined();
  expect(backTimingMarks.bottomLeft).toBeDefined();
  expect(backTimingMarks.bottomRight).toBeDefined();
  expect(backTimingMarks.left).toHaveLength(gridSize.height);
  expect(backTimingMarks.right).toHaveLength(gridSize.height);
  expect(backTimingMarks.top).toHaveLength(gridSize.width);
  expect(backTimingMarks.bottom).toHaveLength(19);

  const frontCompleteTimingMarks = interpolateMissingTimingMarks(
    hudson.front,
    frontTimingMarks
  );
  const backCompleteTimingMarks = interpolateMissingTimingMarks(
    hudson.back,
    backTimingMarks
  );
  const frontTemplateOvals = findTemplateOvals(
    hudson.front,
    await templates.getOvalTemplate(),
    frontCompleteTimingMarks,
    {
      usableArea: TemplateBallotCardGeometry8pt5x14.frontUsableArea,
      debug: frontDebug,
    }
  );
  expect(frontTemplateOvals).toHaveLength(55);
  expect(asciiOvalGrid(frontTemplateOvals)).toMatchInlineSnapshot(`
    "                                 
                                     
                                     
                                     
                                     
                                     
                                     
                                     
                                     
                O      O      O     O
                                     
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
                                     
                                     
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
    "
  `);
  const backTemplateOvals = findTemplateOvals(
    hudson.back,
    await templates.getOvalTemplate(),
    backCompleteTimingMarks,
    {
      usableArea: TemplateBallotCardGeometry8pt5x14.backUsableArea,
      debug: backDebug,
    }
  );
  expect(backTemplateOvals).toHaveLength(20);
  expect(asciiOvalGrid(backTemplateOvals)).toMatchInlineSnapshot(`
    "                                 
                                     
                                     
                                     
                O      O            O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
    "
  `);

  const grid = readGridFromElectionDefinition(hudson.definition);
  const pairResult = pairColumnEntries(
    grid.map((entry) => ({ ...entry, side: 'front' as const })),
    [
      ...frontTemplateOvals.map((oval) => ({
        ...oval,
        side: 'front' as const,
      })),
      ...backTemplateOvals.map((oval) => ({
        ...oval,
        side: 'back' as const,
      })),
    ]
  );
  expect(pairResult.success).toEqual(true);
  expect(pairResult.pairs).toHaveLength(
    frontTemplateOvals.length + backTemplateOvals.length
  );

  const frontBits = decodeBottomRowTimingMarks(frontTimingMarks);
  assert(frontBits, 'decodeBottomRowTimingMarks failed');
  frontBits.reverse(); // make LSB first

  const backBits = decodeBottomRowTimingMarks(backTimingMarks);
  assert(backBits, 'decodeBottomRowTimingMarks failed');
  backBits.reverse(); // make LSB first

  const frontMetadata = decodeFrontTimingMarkBits(frontBits);
  expect(frontMetadata).toEqual(
    typedAs<FrontMarksMetadata>({
      side: 'front',
      batchOrPrecinctNumber: 53,
      bits: [
        1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 1,
      ],
      cardNumber: 54,
      computedMod4CheckSum: 1,
      mod4CheckSum: 1,
      sequenceNumber: 0,
      startBit: 1,
    })
  );
  unsafeParse(FrontMarksMetadataSchema, frontMetadata);

  const backMetadata = decodeBackTimingMarkBits(backBits);
  expect(backMetadata).toEqual(
    typedAs<BackMarksMetadata>({
      side: 'back',
      bits: [
        1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1,
        1, 1, 0, 1, 1, 1, 1, 0,
      ],
      electionYear: 20,
      electionMonth: 11,
      electionDay: 3,
      electionType: 'G',
      enderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
      expectedEnderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
    })
  );
  unsafeParse(BackMarksMetadataSchema, backMetadata);
});

test('scanned front', async () => {
  const imageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanUnmarkedFront.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const debug = testImageDebugger(imageData);
  const layout = interpretBallotCardLayout(imageData, {
    geometry: ScannedBallotCardGeometry8pt5x14,
    debug,
  });
  assert(layout, 'interpretBallotCardLayout failed');
  renderTimingMarks(debug, layout.completeTimingMarks);
});
