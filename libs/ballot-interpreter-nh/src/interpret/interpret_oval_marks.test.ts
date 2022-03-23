import { safeParseElectionDefinition } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import {
  HudsonFixtureName,
  readFixtureImage,
  readFixtureJson,
} from '../../test/fixtures';
import {
  getScannedBallotCardGeometry,
  ScannedBallotCardGeometry8pt5x14,
} from '../accuvote';
import * as templates from '../data/templates';
import { withSvgDebugger } from '../debug';
import { interpretOvalMarks } from './interpret_oval_marks';
import { interpretPageLayout } from './interpret_page_layout';

test('interpretOvalMarks unmarked front', async () => {
  const electionDefinition = safeParseElectionDefinition(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  const geometry = getScannedBallotCardGeometry(
    electionDefinition.election.ballotLayout!.paperSize
  );
  const frontImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-front'
  );
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-unmarked-back'
  );
  const frontLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, frontImageData);
    return interpretPageLayout(frontImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
  });
  const backLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, backImageData);
    return interpretPageLayout(backImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
  });
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
        "y": 1,
      },
    }
  `);

  // If the highest score changes, it should be by going down.
  expect(markWithHighestScore).toMatchInlineSnapshot(`
    Object {
      "bounds": Object {
        "height": 25,
        "maxX": 641,
        "maxY": 1755,
        "minX": 604,
        "minY": 1731,
        "width": 38,
        "x": 604,
        "y": 1731,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "State-Representatives-7d3a8821",
        "optionId": "Lynne-Ober-f704df17",
        "row": 33,
        "side": "front",
        "type": "option",
      },
      "score": 0.009756097560975618,
      "scoredOffset": Object {
        "x": 2,
        "y": 1,
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
    'scan-marked-front'
  );
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-back'
  );
  const frontLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, frontImageData);
    return interpretPageLayout(frontImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
  });
  const backLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, backImageData);
    return interpretPageLayout(backImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
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
        "maxX": 658,
        "maxY": 2249,
        "minX": 621,
        "minY": 2225,
        "width": 38,
        "x": 621,
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
      "score": 0.04634146341463419,
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
      "score": 0.7609756097560976,
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
    'scan-marked-rotated-front'
  );
  const backImageData = await readFixtureImage(
    HudsonFixtureName,
    'scan-marked-rotated-back'
  );
  const frontLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, frontImageData);
    return interpretPageLayout(frontImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
  });
  const backLayout = await withSvgDebugger(async (debug) => {
    debug.imageData(0, 0, backImageData);
    const result = interpretPageLayout(backImageData, {
      geometry: ScannedBallotCardGeometry8pt5x14,
      debug,
    });
    result?.completeMarks.left.forEach((mark) => {
      debug.rect(mark.x, mark.y, mark.width, mark.height, 'green');
    });
    result?.completeMarks.right.forEach((mark) => {
      debug.rect(mark.x, mark.y, mark.width, mark.height, 'blue');
    });
    result?.completeMarks.top.forEach((mark) => {
      debug.rect(mark.x, mark.y, mark.width, mark.height, 'purple');
    });
    result?.completeMarks.bottom.forEach((mark) => {
      debug.rect(mark.x, mark.y, mark.width, mark.height, 'yellow');
    });
    return result;
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
        "maxX": 1093,
        "maxY": 2246,
        "minX": 1056,
        "minY": 2222,
        "width": 38,
        "x": 1056,
        "y": 2222,
      },
      "gridPosition": Object {
        "column": 12,
        "contestId": "President-and-Vice-President-of-the-United-States-18d1a55a",
        "optionId": "Donald-J-Trump-and-Michael-R-Pence-3e3f31a7",
        "row": 9,
        "side": "front",
        "type": "option",
      },
      "score": 0.41951219512195126,
      "scoredOffset": Object {
        "x": 2,
        "y": 0,
      },
    }
  `);
});
