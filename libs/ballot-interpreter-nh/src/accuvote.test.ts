import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import {
  HudsonFixtureName,
  readFixtureBallotCardDefinition,
  readFixtureImage,
} from '../test/fixtures';
import { asciiOvalGrid } from '../test/utils';
import {
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
  findTemplateOvals,
  findTimingMarks,
  scanForTimingMarksByScoringBlocks,
  ScannedBallotCardGeometry8pt5x14,
  TemplateBallotCardGeometry8pt5x14,
} from './accuvote';
import { pairColumnEntries, readGridFromElectionDefinition } from './convert';
import * as templates from './data/templates';
import { withCanvasDebugger, withSvgDebugger } from './debug';
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
  const hudson = await readFixtureBallotCardDefinition(
    HudsonFixtureName,
    'definition'
  );
  const frontRects = withSvgDebugger((debug) => {
    debug.imageData(0, 0, hudson.front);
    return scanForTimingMarksByScoringBlocks(hudson.front, {
      minimumScore: 0.75,
      debug,
    });
  });
  const backRects = withSvgDebugger((debug) => {
    debug.imageData(0, 0, hudson.back);
    return scanForTimingMarksByScoringBlocks(hudson.back, {
      minimumScore: 0.75,
      debug,
    });
  });
  const frontTimingMarks = withSvgDebugger((debug) => {
    debug.imageData(0, 0, hudson.front);
    return findTimingMarks({
      geometry: TemplateBallotCardGeometry8pt5x14,
      rects: frontRects,
      debug,
    });
  });
  if (!frontTimingMarks) {
    return;
  }
  const backTimingMarks = withSvgDebugger((debug) => {
    debug.imageData(0, 0, hudson.back);
    return findTimingMarks({
      geometry: TemplateBallotCardGeometry8pt5x14,
      rects: backRects,
      debug,
    });
  });
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

  const frontCompleteTimingMarks =
    interpolateMissingTimingMarks(frontTimingMarks);
  const backCompleteTimingMarks =
    interpolateMissingTimingMarks(backTimingMarks);
  const frontTemplateOvals = await withSvgDebugger(async (debug) =>
    findTemplateOvals(
      hudson.front,
      await templates.getOvalTemplate(),
      frontCompleteTimingMarks,
      {
        usableArea: TemplateBallotCardGeometry8pt5x14.frontUsableArea,
        debug,
      }
    )
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
  const backTemplateOvals = await withSvgDebugger(async (debug) =>
    findTemplateOvals(
      hudson.back,
      await templates.getOvalTemplate(),
      backCompleteTimingMarks,
      {
        usableArea: TemplateBallotCardGeometry8pt5x14.backUsableArea,
        debug,
      }
    )
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
  const paired = pairColumnEntries(
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
  ).unsafeUnwrap();
  expect(paired).toHaveLength(
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
  const imageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-front'
  );
  const rects = withCanvasDebugger(
    imageData.width,
    imageData.height,
    (debug) => {
      debug.imageData(0, 0, imageData);
      return scanForTimingMarksByScoringBlocks(imageData, {
        minimumScore: 0.75,
        debug,
      });
    }
  );
  const timingMarks = withCanvasDebugger(
    imageData.width,
    imageData.height,
    (debug) => {
      debug.imageData(0, 0, imageData);
      return findTimingMarks({
        geometry: ScannedBallotCardGeometry8pt5x14,
        rects,
        debug,
      });
    }
  );
  if (timingMarks) {
    withCanvasDebugger(imageData.width, imageData.height, (debug) => {
      debug.imageData(0, 0, imageData);
      renderTimingMarks(debug, timingMarks);
    });
  }
});
