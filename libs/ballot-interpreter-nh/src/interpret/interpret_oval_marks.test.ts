import { safeParseElectionDefinition } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import {
  HudsonFixtureName,
  readFixtureImage,
  readFixtureJson,
} from '../../test/fixtures';
import { testImageDebugger } from '../../test/utils';
import {
  getScannedBallotCardGeometry,
  ScannedBallotCardGeometry8pt5x14,
} from '../accuvote';
import * as templates from '../data/templates';
import { interpretBallotCardLayout } from './interpret_ballot_card_layout';
import { interpretOvalMarks } from './interpret_oval_marks';

test('interpretOvalMarks unmarked sheet', async () => {
  const electionDefinition = safeParseElectionDefinition(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-front',
    ScannedBallotCardGeometry8pt5x14
  );
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-back',
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
        "height": 25,
        "maxX": 664,
        "maxY": 780,
        "minX": 627,
        "minY": 756,
        "width": 38,
        "x": 627,
        "y": 756,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "Governor-061a401b",
        "optionId": "Chris-Sununu-130124f7",
        "row": 13,
        "side": "front",
        "type": "option",
      },
      "score": 0,
      "scoredOffset": Object {
        "x": 2,
        "y": 2,
      },
    }
  `);

  // If the highest score changes, it should be by going down.
  expect(markWithHighestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 25,
        "maxX": 629,
        "maxY": 2241,
        "minX": 592,
        "minY": 2217,
        "width": 38,
        "x": 592,
        "y": 2217,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "State-Representatives-7d3a8821",
        "optionId": "Denise-Smith-0a6359c3",
        "row": 43,
        "side": "front",
        "type": "option",
      },
      "score": 0.023602484472049712,
      "scoredOffset": Object {
        "x": 0,
        "y": 2,
      },
    }
  `);
});

test('interpretOvalMarks marked front', async () => {
  const electionDefinition = safeParseElectionDefinition(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-front',
    ScannedBallotCardGeometry8pt5x14
  );
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-back',
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
        "height": 25,
        "maxX": 660,
        "maxY": 1763,
        "minX": 623,
        "minY": 1739,
        "width": 38,
        "x": 623,
        "y": 1739,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "State-Representatives-7d3a8821",
        "optionId": "Lynne-Ober-f704df17",
        "row": 33,
        "side": "front",
        "type": "option",
      },
      "score": 0.039751552795031064,
      "scoredOffset": Object {
        "x": 3,
        "y": 1,
      },
    }
  `);

  // If the highest score changes, it should be by going up.
  expect(markWithHighestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 25,
        "maxX": 1627,
        "maxY": 587,
        "minX": 1590,
        "minY": 563,
        "width": 38,
        "x": 1590,
        "y": 563,
      },
      "gridPosition": Object {
        "column": 32,
        "contestId": "President-and-Vice-President-of-the-United-States-18d1a55a",
        "row": 9,
        "side": "front",
        "type": "write-in",
        "writeInIndex": 0,
      },
      "score": 0.7726708074534161,
      "scoredOffset": Object {
        "x": -3,
        "y": -3,
      },
    }
  `);
});

test('interpretOvalMarks marked rotated front', async () => {
  const electionDefinition = safeParseElectionDefinition(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-rotated-front',
    ScannedBallotCardGeometry8pt5x14
  );
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-rotated-back',
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
        "height": 25,
        "maxX": 640,
        "maxY": 577,
        "minX": 603,
        "minY": 553,
        "width": 38,
        "x": 603,
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
      "score": 0.4397515527950311,
      "scoredOffset": Object {
        "x": 1,
        "y": 2,
      },
    }
  `);
});
