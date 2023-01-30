import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { readFixtureImage } from '../../test/fixtures';
import { testImageDebugger } from '../../test/utils';
import {
  getScannedBallotCardGeometry,
  ScannedBallotCardGeometry8pt5x14,
} from '../accuvote';
import * as templates from '../data/templates';
import { interpretBallotCardLayout } from './interpret_ballot_card_layout';
import { interpretOvalMarks } from './interpret_oval_marks';

test('interpretOvalMarks unmarked sheet', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanUnmarkedFront.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const backImageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanUnmarkedBack.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const frontDebug = testImageDebugger(frontImageData);
  const frontLayout = frontDebug.capture('front', () =>
    interpretBallotCardLayout(frontImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug: frontDebug,
    })
  );
  const backDebug = testImageDebugger(backImageData);
  const backLayout = backDebug.capture('back', () =>
    interpretBallotCardLayout(backImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug: backDebug,
    })
  );
  const gridLayout = electionDefinition.election.gridLayouts?.[0];

  assert(frontLayout?.side === 'front', 'frontLayout could not be read');
  assert(backLayout?.side === 'back', 'backLayout could not be read');
  assert(gridLayout, 'gridLayout is not present');

  const ovalTemplate = await templates.getOvalScanTemplate();

  const unmarkedOvalMarks = interpretOvalMarks({
    geometry,
    ovalTemplate,
    frontImageData,
    backImageData,
    frontLayout,
    backLayout,
    gridLayout,
  });

  const markWithLowestScore = unmarkedOvalMarks.reduce((acc, mark) =>
    acc.score > mark.score ? mark : acc
  );
  const markWithHighestScore = unmarkedOvalMarks.reduce((acc, mark) =>
    acc.score < mark.score ? mark : acc
  );

  // If the lowest score changes, it should be by going down.
  expect(markWithLowestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 26,
        "maxX": 668,
        "maxY": 585,
        "minX": 629,
        "minY": 560,
        "width": 40,
        "x": 629,
        "y": 560,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "President-and-Vice-President-of-the-United-States-18d1a55a",
        "optionId": "Donald-J-Trump-and-Michael-R-Pence-3e3f31a7",
        "row": 9,
        "side": "front",
        "type": "option",
      },
      "score": 0,
      "scoredOffset": Object {
        "x": 0,
        "y": 1,
      },
    }
  `);

  // If the highest score changes, it should be by going down.
  expect(markWithHighestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 26,
        "maxX": 668,
        "maxY": 585,
        "minX": 629,
        "minY": 560,
        "width": 40,
        "x": 629,
        "y": 560,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "President-and-Vice-President-of-the-United-States-18d1a55a",
        "optionId": "Donald-J-Trump-and-Michael-R-Pence-3e3f31a7",
        "row": 9,
        "side": "front",
        "type": "option",
      },
      "score": 0,
      "scoredOffset": Object {
        "x": 0,
        "y": 1,
      },
    }
  `);
});

test('interpretOvalMarks marked front', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanMarkedFront.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const backImageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanMarkedBack.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const frontDebug = testImageDebugger(frontImageData);
  const frontLayout = interpretBallotCardLayout(frontImageData, {
    geometry: ScannedBallotCardGeometry8pt5x14,
    debug: frontDebug,
  });
  const backDebug = testImageDebugger(backImageData);
  const backLayout = interpretBallotCardLayout(backImageData, {
    geometry: ScannedBallotCardGeometry8pt5x14,
    debug: backDebug,
  });
  const gridLayout = electionDefinition.election.gridLayouts?.[0];

  assert(frontLayout?.side === 'front', 'frontLayout could not be read');
  assert(backLayout?.side === 'back', 'backLayout could not be read');
  assert(gridLayout, 'gridLayout is not present');

  const ovalTemplate = await templates.getOvalScanTemplate();

  const markedOvalMarks = interpretOvalMarks({
    geometry,
    ovalTemplate,
    frontImageData,
    backImageData,
    frontLayout,
    backLayout,
    gridLayout,
  });

  const markWithLowestScore = markedOvalMarks.reduce((acc, mark) =>
    acc.score > mark.score ? mark : acc
  );
  const markWithHighestScore = markedOvalMarks.reduce((acc, mark) =>
    acc.score < mark.score ? mark : acc
  );

  // If the lowest score changes, it should be by going up.
  expect(markWithLowestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 26,
        "maxX": 659,
        "maxY": 2250,
        "minX": 620,
        "minY": 2225,
        "width": 40,
        "x": 620,
        "y": 2225,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "State-Representatives-7d3a8821",
        "optionId": "Denise-Smith-0a6359c3",
        "row": 43,
        "side": "front",
        "type": "option",
      },
      "score": 0.025,
      "scoredOffset": Object {
        "x": 1,
        "y": 2,
      },
    }
  `);

  // If the highest score changes, it should be by going up.
  expect(markWithHighestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 26,
        "maxX": 662,
        "maxY": 1226,
        "minX": 623,
        "minY": 1201,
        "width": 40,
        "x": 623,
        "y": 1201,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Dave-Wheeler-de2242ee",
        "row": 22,
        "side": "front",
        "type": "option",
      },
      "score": 0.5375,
      "scoredOffset": Object {
        "x": 3,
        "y": 1,
      },
    }
  `);
});

test('interpretOvalMarks marked rotated front', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanMarkedRotatedFront.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const backImageData = readFixtureImage(
    await electionGridLayoutNewHampshireHudsonFixtures.scanMarkedRotatedBack.asImage(),
    ScannedBallotCardGeometry8pt5x14
  );
  const frontDebug = testImageDebugger(frontImageData);
  const frontLayout = interpretBallotCardLayout(frontImageData, {
    geometry: ScannedBallotCardGeometry8pt5x14,
    debug: frontDebug,
  });
  const backDebug = testImageDebugger(backImageData);
  const backLayout = interpretBallotCardLayout(backImageData, {
    geometry: ScannedBallotCardGeometry8pt5x14,
    debug: backDebug,
  });
  const gridLayout = electionDefinition.election.gridLayouts?.[0];

  assert(frontLayout?.side === 'front', 'frontLayout could not be read');
  assert(backLayout?.side === 'back', 'backLayout could not be read');
  assert(gridLayout, 'gridLayout is not present');

  const ovalTemplate = await templates.getOvalScanTemplate();

  const markedOvalMarks = interpretOvalMarks({
    geometry,
    ovalTemplate,
    frontImageData,
    backImageData,
    frontLayout,
    backLayout,
    gridLayout,
  });

  expect(
    markedOvalMarks.find(
      (mark) =>
        mark.gridPosition.contestId ===
          'President-and-Vice-President-of-the-United-States-18d1a55a' &&
        mark.gridPosition.type === 'option' &&
        mark.gridPosition.optionId ===
          'Donald-J-Trump-and-Michael-R-Pence-3e3f31a7'
    )
  ).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 26,
        "maxX": 640,
        "maxY": 578,
        "minX": 601,
        "minY": 553,
        "width": 40,
        "x": 601,
        "y": 553,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "President-and-Vice-President-of-the-United-States-18d1a55a",
        "optionId": "Donald-J-Trump-and-Michael-R-Pence-3e3f31a7",
        "row": 9,
        "side": "front",
        "type": "option",
      },
      "score": 0.30865384615384617,
      "scoredOffset": Object {
        "x": 0,
        "y": 3,
      },
    }
  `);
});
