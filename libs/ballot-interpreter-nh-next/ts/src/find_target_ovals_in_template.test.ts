import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import { findTargetOvalsInTemplate } from './find_target_ovals_in_template';
import * as ovalTemplate from './data/oval.png';
import { findGrid } from './find_grid';

test('findTargetOvalsInTemplate Amherst ballot', async () => {
  const ballotImage =
    await electionGridLayoutNewHampshireAmherstFixtures.templateFront.asImageData();
  const { grid } = findGrid(ballotImage, { template: true });
  expect(
    findTargetOvalsInTemplate(
      ballotImage,
      await ovalTemplate.asImageData(),
      grid
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "column": 12,
        "row": 8,
        "side": "front",
      },
      {
        "column": 19,
        "row": 8,
        "side": "front",
      },
      {
        "column": 26,
        "row": 8,
        "side": "front",
      },
      {
        "column": 32,
        "row": 8,
        "side": "front",
      },
      {
        "column": 12,
        "row": 11,
        "side": "front",
      },
      {
        "column": 19,
        "row": 11,
        "side": "front",
      },
      {
        "column": 32,
        "row": 11,
        "side": "front",
      },
      {
        "column": 12,
        "row": 14,
        "side": "front",
      },
      {
        "column": 19,
        "row": 14,
        "side": "front",
      },
      {
        "column": 26,
        "row": 14,
        "side": "front",
      },
      {
        "column": 32,
        "row": 14,
        "side": "front",
      },
      {
        "column": 12,
        "row": 17,
        "side": "front",
      },
      {
        "column": 19,
        "row": 17,
        "side": "front",
      },
      {
        "column": 32,
        "row": 17,
        "side": "front",
      },
      {
        "column": 12,
        "row": 20,
        "side": "front",
      },
      {
        "column": 19,
        "row": 20,
        "side": "front",
      },
      {
        "column": 32,
        "row": 20,
        "side": "front",
      },
      {
        "column": 19,
        "row": 23,
        "side": "front",
      },
      {
        "column": 32,
        "row": 23,
        "side": "front",
      },
      {
        "column": 12,
        "row": 24,
        "side": "front",
      },
      {
        "column": 26,
        "row": 24,
        "side": "front",
      },
      {
        "column": 19,
        "row": 25,
        "side": "front",
      },
      {
        "column": 32,
        "row": 25,
        "side": "front",
      },
      {
        "column": 12,
        "row": 26,
        "side": "front",
      },
      {
        "column": 26,
        "row": 26,
        "side": "front",
      },
      {
        "column": 19,
        "row": 27,
        "side": "front",
      },
      {
        "column": 32,
        "row": 27,
        "side": "front",
      },
      {
        "column": 12,
        "row": 28,
        "side": "front",
      },
      {
        "column": 12,
        "row": 32,
        "side": "front",
      },
      {
        "column": 19,
        "row": 32,
        "side": "front",
      },
      {
        "column": 26,
        "row": 32,
        "side": "front",
      },
      {
        "column": 32,
        "row": 32,
        "side": "front",
      },
    ]
  `);
});

test('findTargetOvalsInTemplate Hudson ballot', async () => {
  const ballotImage =
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImageData();
  const { grid } = findGrid(ballotImage, { template: true });
  expect(
    findTargetOvalsInTemplate(
      ballotImage,
      await ovalTemplate.asImageData(),
      grid
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "column": 12,
        "row": 9,
        "side": "front",
      },
      {
        "column": 19,
        "row": 9,
        "side": "front",
      },
      {
        "column": 26,
        "row": 9,
        "side": "front",
      },
      {
        "column": 32,
        "row": 9,
        "side": "front",
      },
      {
        "column": 12,
        "row": 13,
        "side": "front",
      },
      {
        "column": 19,
        "row": 13,
        "side": "front",
      },
      {
        "column": 26,
        "row": 13,
        "side": "front",
      },
      {
        "column": 32,
        "row": 13,
        "side": "front",
      },
      {
        "column": 12,
        "row": 16,
        "side": "front",
      },
      {
        "column": 19,
        "row": 16,
        "side": "front",
      },
      {
        "column": 26,
        "row": 16,
        "side": "front",
      },
      {
        "column": 32,
        "row": 16,
        "side": "front",
      },
      {
        "column": 12,
        "row": 19,
        "side": "front",
      },
      {
        "column": 19,
        "row": 19,
        "side": "front",
      },
      {
        "column": 26,
        "row": 19,
        "side": "front",
      },
      {
        "column": 32,
        "row": 19,
        "side": "front",
      },
      {
        "column": 12,
        "row": 22,
        "side": "front",
      },
      {
        "column": 19,
        "row": 22,
        "side": "front",
      },
      {
        "column": 32,
        "row": 22,
        "side": "front",
      },
      {
        "column": 12,
        "row": 25,
        "side": "front",
      },
      {
        "column": 19,
        "row": 25,
        "side": "front",
      },
      {
        "column": 32,
        "row": 25,
        "side": "front",
      },
      {
        "column": 19,
        "row": 28,
        "side": "front",
      },
      {
        "column": 32,
        "row": 28,
        "side": "front",
      },
      {
        "column": 12,
        "row": 29,
        "side": "front",
      },
      {
        "column": 19,
        "row": 30,
        "side": "front",
      },
      {
        "column": 32,
        "row": 30,
        "side": "front",
      },
      {
        "column": 12,
        "row": 31,
        "side": "front",
      },
      {
        "column": 19,
        "row": 32,
        "side": "front",
      },
      {
        "column": 32,
        "row": 32,
        "side": "front",
      },
      {
        "column": 12,
        "row": 33,
        "side": "front",
      },
      {
        "column": 19,
        "row": 34,
        "side": "front",
      },
      {
        "column": 32,
        "row": 34,
        "side": "front",
      },
      {
        "column": 12,
        "row": 35,
        "side": "front",
      },
      {
        "column": 19,
        "row": 36,
        "side": "front",
      },
      {
        "column": 32,
        "row": 36,
        "side": "front",
      },
      {
        "column": 12,
        "row": 37,
        "side": "front",
      },
      {
        "column": 19,
        "row": 38,
        "side": "front",
      },
      {
        "column": 32,
        "row": 38,
        "side": "front",
      },
      {
        "column": 12,
        "row": 39,
        "side": "front",
      },
      {
        "column": 19,
        "row": 40,
        "side": "front",
      },
      {
        "column": 32,
        "row": 40,
        "side": "front",
      },
      {
        "column": 12,
        "row": 41,
        "side": "front",
      },
      {
        "column": 19,
        "row": 42,
        "side": "front",
      },
      {
        "column": 32,
        "row": 42,
        "side": "front",
      },
      {
        "column": 12,
        "row": 43,
        "side": "front",
      },
      {
        "column": 19,
        "row": 44,
        "side": "front",
      },
      {
        "column": 32,
        "row": 44,
        "side": "front",
      },
      {
        "column": 12,
        "row": 45,
        "side": "front",
      },
      {
        "column": 19,
        "row": 46,
        "side": "front",
      },
      {
        "column": 32,
        "row": 46,
        "side": "front",
      },
      {
        "column": 12,
        "row": 47,
        "side": "front",
      },
      {
        "column": 19,
        "row": 48,
        "side": "front",
      },
      {
        "column": 32,
        "row": 48,
        "side": "front",
      },
      {
        "column": 12,
        "row": 49,
        "side": "front",
      },
    ]
  `);
});
