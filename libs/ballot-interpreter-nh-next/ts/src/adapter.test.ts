import { assert, ok } from '@votingworks/basics';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { AdjudicationReason, SheetOf } from '@votingworks/types';
import { convertMarksToAdjudicationInfo, interpret } from './adapter';
import { BallotSide } from './types';

test('convertMarksToAdjudicationInfo', () => {
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

  expect(
    convertMarksToAdjudicationInfo(
      electionDefinition,
      {
        isTestMode: true,
        adjudicationReasons: [
          AdjudicationReason.MarginalMark,
          AdjudicationReason.Overvote,
        ],
        markThresholds: {
          marginal: 0.04,
          definite: 0.07,
        },
      },
      [
        [
          {
            type: 'option',
            side: 'front',
            column: 1,
            row: 1,
            contestId: 'Governor-061a401b',
            optionId: 'Josiah-Bartlett-1bb99985',
          },
          {
            expectedBounds: { left: 0, top: 0, width: 0, height: 0 },
            matchedBounds: { left: 0, top: 0, width: 0, height: 0 },
            location: { side: BallotSide.Front, column: 1, row: 1 },
            matchScore: 1,
            fillScore: 1,
          },
        ],
        [
          {
            type: 'option',
            side: 'front',
            column: 1,
            row: 2,
            contestId: 'Governor-061a401b',
            optionId: 'Hannah-Dustin-ab4ef7c8',
          },
          {
            expectedBounds: { left: 0, top: 0, width: 0, height: 0 },
            matchedBounds: { left: 0, top: 0, width: 0, height: 0 },
            location: { side: BallotSide.Front, column: 1, row: 2 },
            matchScore: 1,
            fillScore: 0.05,
          },
        ],
        [
          {
            type: 'option',
            side: 'front',
            column: 1,
            row: 3,
            contestId: 'Governor-061a401b',
            optionId: 'John-Spencer-9ffb5970',
          },
          {
            expectedBounds: { left: 0, top: 0, width: 0, height: 0 },
            matchedBounds: { left: 0, top: 0, width: 0, height: 0 },
            location: { side: BallotSide.Front, column: 1, row: 3 },
            matchScore: 1,
            fillScore: 0,
          },
        ],
        [
          {
            type: 'option',
            side: 'front',
            column: 1,
            row: 4,
            contestId: 'Governor-061a401b',
            optionId: 'write-in-0',
          },
          {
            expectedBounds: { left: 0, top: 0, width: 0, height: 0 },
            matchedBounds: { left: 0, top: 0, width: 0, height: 0 },
            location: { side: BallotSide.Front, column: 1, row: 4 },
            matchScore: 1,
            fillScore: 0.07,
          },
        ],
      ]
    )
  ).toMatchInlineSnapshot(`
    {
      "enabledReasonInfos": [
        {
          "contestId": "Governor-061a401b",
          "optionId": "Hannah-Dustin-ab4ef7c8",
          "optionIndex": 1,
          "type": "MarginalMark",
        },
        {
          "contestId": "Governor-061a401b",
          "expected": 1,
          "optionIds": [
            "Josiah-Bartlett-1bb99985",
            "write-in-0",
          ],
          "optionIndexes": [
            0,
            3,
          ],
          "type": "Overvote",
        },
      ],
      "enabledReasons": [
        "MarginalMark",
        "Overvote",
      ],
      "ignoredReasonInfos": [],
      "requiresAdjudication": true,
    }
  `);
});

test('interpret with valid data', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;
  const ballotImagePaths: SheetOf<string> = [
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath(),
    electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath(),
  ];

  const result = await interpret(electionDefinition, ballotImagePaths, {
    isTestMode: true,
    adjudicationReasons: [],
  });
  expect(result).toEqual(ok(expect.anything()));

  const [front, back] = result.unsafeUnwrap();
  assert(front.interpretation.type === 'InterpretedHmpbPage');
  assert(back.interpretation.type === 'InterpretedHmpbPage');
  expect(front.normalizedImage).toBeDefined();
  expect(back.normalizedImage).toBeDefined();
  expect(front.interpretation.layout).toMatchSnapshot();
  expect(back.interpretation.layout).toMatchSnapshot();
  expect(
    [
      ...front.interpretation.markInfo.marks,
      ...back.interpretation.markInfo.marks,
    ].map((mark) => ({
      contestId: mark.contestId,
      optionId: mark.optionId,
      score: mark.score,
    }))
  ).toMatchInlineSnapshot(`
    [
      {
        "contestId": "Governor-061a401b",
        "optionId": "Josiah-Bartlett-1bb99985",
        "score": 0.38557693,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "John-Langdon-5951c8e1",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Jeremiah-Smith-469560c9",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Anne-Waldron-ee0cbc85",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "James-Poole-db5ef4bd",
        "score": 0.2875,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Obadiah-Carrigan-5c95145a",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Mary-Baker-Eddy-350785d5",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Bell-17973275",
        "score": 0.3201923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Abeil-Foster-ded38e36",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "Hannah-Dustin-ab4ef7c8",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "William-Preston-3778fcd5",
        "score": 0.37980768,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Nicholas-Gilman-1791aed7",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "Daniel-Webster-13f77b2d",
        "score": 0,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "Matthew-Thornton-f66fec5e",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Samuel-Livermore-f927fef1",
        "score": 0.3221154,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Elijah-Miller-a52e6988",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Isaac-Hill-d6c9deeb",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "Charles-H-Hersey-096286a4",
        "score": 0.2778846,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "John-Spencer-9ffb5970",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "Richard-Coote-b9095636",
        "score": 0.32307693,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Abigail-Bartlett-4e46c9d4",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "Jacob-Freese-b5146505",
        "score": 0.3326923,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "William-Lovejoy-fde3c2df",
        "score": 0,
      },
      {
        "contestId": "Governor-061a401b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "United-States-Senator-d3f1c75b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Representative-in-Congress-24683b44",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Executive-Councilor-bb22557f",
        "optionId": "write-in-0",
        "score": 0.24903846,
      },
      {
        "contestId": "State-Senator-391381f8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-1",
        "score": 0,
      },
      {
        "contestId": "State-Representatives-Hillsborough-District-34-b1012d38",
        "optionId": "write-in-2",
        "score": 0,
      },
      {
        "contestId": "State-Representative-Hillsborough-District-37-f3bde894",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0.30192307,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Ezra-Bartlett-8f95223c",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "John-Smith-ef61a579",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "John-Mann-b56bbdd3",
        "score": 0.35192308,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Nathaniel-Parker-56a06c29",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Ichabod-Goodwin-55e8de1f",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "Edward-Randolph-bf4c848a",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "Mary-Woolson-dc0b854a",
        "score": 0.31923077,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "Jane-Jones-9caa141f",
        "score": 0,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "Ellen-A-Stileman-14408737",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "Claire-Cutts-07a436e7",
        "score": 0.2971154,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "Valbe-Cady-ba3af3af",
        "score": 0,
      },
      {
        "contestId": "Sheriff-4243fe0b",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Attorney-133f910f",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Treasurer-87d25a31",
        "optionId": "write-in-0",
        "score": 0.37115383,
      },
      {
        "contestId": "Register-of-Deeds-a1278df2",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "Register-of-Probate-a4117da8",
        "optionId": "write-in-0",
        "score": 0,
      },
      {
        "contestId": "County-Commissioner-d6feed25",
        "optionId": "write-in-0",
        "score": 0.30865383,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "yes",
        "score": 0.32596153,
      },
      {
        "contestId": "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc",
        "optionId": "no",
        "score": 0,
      },
    ]
  `);
});
