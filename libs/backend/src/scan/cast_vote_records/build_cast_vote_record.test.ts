/* eslint-disable vx/gts-identifiers */

import { assert, find } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  BallotIdSchema,
  BallotPageMetadata,
  BallotType,
  CandidateContest,
  CVR,
  getBallotStyle,
  getContests,
  unsafeParse,
} from '@votingworks/types';
import {
  bestFishContest,
  fishCouncilContest,
  fishingContest,
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage2,
} from '../../../test/fixtures/interpretations';
import {
  buildCastVoteRecord,
  buildCVRContestsFromVotes,
  getCVRBallotType,
  getOptionPosition,
  hasWriteIns,
} from './build_cast_vote_record';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
const { election, electionHash } = electionDefinition;

test('getCVRBallotType', () => {
  expect(getCVRBallotType(BallotType.Absentee)).toEqual('absentee');
  expect(getCVRBallotType(BallotType.Standard)).toEqual('standard');
  expect(getCVRBallotType(BallotType.Provisional)).toEqual('provisional');
});

const mammalCouncilContest = find(
  election.contests,
  (contest) => contest.id === 'zoo-council-mammal'
) as CandidateContest;

describe('getOptionPosition', () => {
  test('handles option position for ballot measure contests', () => {
    const contest = fishingContest;
    expect(getOptionPosition({ contest, optionId: 'yes' })).toEqual(0);
    expect(getOptionPosition({ contest, optionId: 'no' })).toEqual(1);
    expect(() =>
      getOptionPosition({ contest, optionId: 'other' })
    ).toThrowError();
  });

  test('handles option position for candidate id', () => {
    const contest = mammalCouncilContest;
    expect(getOptionPosition({ contest, optionId: 'zebra' })).toEqual(0);
    expect(getOptionPosition({ contest, optionId: 'elephant' })).toEqual(3);
  });

  test('handles option position for numerical write-in id', () => {
    const contest = mammalCouncilContest;
    expect(getOptionPosition({ contest, optionId: 'write-in-0' })).toEqual(4);
    expect(getOptionPosition({ contest, optionId: 'write-in-2' })).toEqual(6);
  });

  test('throws error for non-numerical write-in id', () => {
    const contest = mammalCouncilContest;
    expect(() =>
      getOptionPosition({ contest, optionId: 'write-in-(FISH)' })
    ).toThrow();
  });

  test('throws error for unrecognizable id', () => {
    const contest = mammalCouncilContest;
    expect(() =>
      getOptionPosition({ contest, optionId: 'seahorse' })
    ).toThrow();
  });
});

describe('buildCVRContestsFromVotes', () => {
  test('builds well-formed ballot measure contest (yes vote)', () => {
    const result = buildCVRContestsFromVotes({
      contests: [fishingContest],
      votes: { [fishingContest.id]: ['yes'] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchInlineSnapshot(`
      Object {
        "@type": "CVR.CVRContest",
        "CVRContestSelection": Array [
          Object {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "yes",
            "OptionPosition": 0,
            "SelectionPosition": Array [
              Object {
                "@type": "CVR.SelectionPosition",
                "HasIndication": "yes",
                "IsAllocable": "yes",
                "NumberVotes": 1,
                "Status": undefined,
              },
            ],
            "Status": undefined,
          },
        ],
        "ContestId": "fishing",
        "Overvotes": undefined,
        "Selections": 2,
        "Status": undefined,
        "Undervotes": undefined,
      }
    `);
  });

  test('ballot measure contest is correct for no vote', () => {
    const result = buildCVRContestsFromVotes({
      contests: [fishingContest],
      votes: { [fishingContest.id]: ['no'] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: 'no',
          OptionPosition: 1,
          SelectionPosition: [expect.anything()],
        }),
      ],
    });
  });

  test('ballot measure contest is correct for overvote', () => {
    const result = buildCVRContestsFromVotes({
      contests: [fishingContest],
      votes: { [fishingContest.id]: ['yes', 'no'] },
      options: { ballotMarkingMode: 'hand' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Status: expect.arrayContaining([
        CVR.ContestStatus.InvalidatedRules,
        CVR.ContestStatus.Overvoted,
      ]),
      Overvotes: 1,
      CVRContestSelection: expect.anything(),
    });
    for (const contestSelection of cvrContest!.CVRContestSelection!) {
      expect(contestSelection).toMatchObject({
        SelectionPosition: [
          expect.objectContaining({
            IsAllocable: CVR.AllocationStatus.No,
            Status: [CVR.PositionStatus.InvalidatedRules],
          }),
        ],
      });
    }
  });

  test('ballot measure contest is correct for undervote', () => {
    const result = buildCVRContestsFromVotes({
      contests: [fishingContest],
      votes: { [fishingContest.id]: [] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Undervotes: 1,
      Status: expect.arrayContaining([
        CVR.ContestStatus.NotIndicated,
        CVR.ContestStatus.Undervoted,
      ]),
    });
  });

  test('builds well-formed candidate contest', () => {
    const result = buildCVRContestsFromVotes({
      contests: [mammalCouncilContest],
      votes: {
        [mammalCouncilContest.id]: mammalCouncilContest.candidates.slice(0, 3),
      },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchInlineSnapshot(`
      Object {
        "@type": "CVR.CVRContest",
        "CVRContestSelection": Array [
          Object {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "zebra",
            "OptionPosition": 0,
            "SelectionPosition": Array [
              Object {
                "@type": "CVR.SelectionPosition",
                "CVRWriteIn": undefined,
                "HasIndication": "yes",
                "IsAllocable": "yes",
                "NumberVotes": 1,
                "Status": undefined,
              },
            ],
            "Status": undefined,
          },
          Object {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "lion",
            "OptionPosition": 1,
            "SelectionPosition": Array [
              Object {
                "@type": "CVR.SelectionPosition",
                "CVRWriteIn": undefined,
                "HasIndication": "yes",
                "IsAllocable": "yes",
                "NumberVotes": 1,
                "Status": undefined,
              },
            ],
            "Status": undefined,
          },
          Object {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "kangaroo",
            "OptionPosition": 2,
            "SelectionPosition": Array [
              Object {
                "@type": "CVR.SelectionPosition",
                "CVRWriteIn": undefined,
                "HasIndication": "yes",
                "IsAllocable": "yes",
                "NumberVotes": 1,
                "Status": undefined,
              },
            ],
            "Status": undefined,
          },
        ],
        "ContestId": "zoo-council-mammal",
        "Overvotes": undefined,
        "Selections": 7,
        "Status": undefined,
        "Undervotes": undefined,
        "WriteIns": undefined,
      }
    `);
  });

  test('candidate contest includes appropriate information when not indicated', () => {
    const result = buildCVRContestsFromVotes({
      contests: [mammalCouncilContest],
      votes: { [mammalCouncilContest.id]: [] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Undervotes: 3,
      Status: expect.arrayContaining([
        CVR.ContestStatus.NotIndicated,
        CVR.ContestStatus.Undervoted,
      ]),
    });
  });

  test('candidate contest includes appropriate information when undervoted', () => {
    const result = buildCVRContestsFromVotes({
      contests: [mammalCouncilContest],
      votes: {
        [mammalCouncilContest.id]: [mammalCouncilContest.candidates[0]!],
      },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Undervotes: 2,
      Status: expect.arrayContaining([CVR.ContestStatus.Undervoted]),
    });
  });

  test('candidate contest includes appropriate information when overvoted', () => {
    const result = buildCVRContestsFromVotes({
      contests: [mammalCouncilContest],
      votes: {
        [mammalCouncilContest.id]: mammalCouncilContest.candidates.slice(0, 4),
      },
      options: { ballotMarkingMode: 'hand' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 1,
      Status: expect.arrayContaining([
        CVR.ContestStatus.Overvoted,
        CVR.ContestStatus.InvalidatedRules,
      ]),
    });

    assert(cvrContest?.CVRContestSelection);
    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
      expect(cvrContestSelection).toMatchObject({
        Status: [CVR.ContestSelectionStatus.InvalidatedRules],
        SelectionPosition: [
          expect.objectContaining({
            IsAllocable: CVR.AllocationStatus.No,
            Status: [CVR.PositionStatus.InvalidatedRules],
          }),
        ],
      });
    }
  });

  test('candidate contest includes appropriate information for HMPB write-in', () => {
    const result = buildCVRContestsFromVotes({
      contests: [mammalCouncilContest],
      votes: {
        [mammalCouncilContest.id]: [
          {
            id: 'write-in-2',
            name: 'Write In #2',
            isWriteIn: true,
          },
        ],
      },
      options: {
        ballotMarkingMode: 'hand',
        imageFileUri: 'file:./ballot-images/image',
      },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];

    // Expecting the contest selection to have status "NeedsAdjudication" but
    // not making any similar assertion on the overall contest status until
    // product requirements are clearer.
    expect(cvrContest).toMatchObject({
      WriteIns: 1,
      CVRContestSelection: [
        {
          ContestSelectionId: 'write-in-2',
          OptionPosition: 6,
          Status: [CVR.ContestSelectionStatus.NeedsAdjudication],
          SelectionPosition: [
            expect.objectContaining({
              IsAllocable: CVR.AllocationStatus.Unknown,
              CVRWriteIn: expect.objectContaining({
                Text: undefined,
                WriteInImage: expect.objectContaining({
                  Location: 'file:./ballot-images/image',
                }),
              }),
            }),
          ],
        },
      ],
    });
  });

  test('candidate contest includes appropriate information for BMD write-in', () => {
    const result = buildCVRContestsFromVotes({
      contests: [mammalCouncilContest],
      votes: {
        [mammalCouncilContest.id]: [
          {
            id: 'write-in-(GREG)',
            name: 'GREG',
            isWriteIn: true,
          },
        ],
      },
      options: {
        ballotMarkingMode: 'machine',
      },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];

    // Expecting the contest selection to have status "NeedsAdjudication" but
    // not making any similar assertion on the overall contest status until
    // product requirements are clearer.
    expect(cvrContest).toMatchObject({
      WriteIns: 1,
      CVRContestSelection: [
        {
          ContestSelectionId: 'write-in-0',
          OptionPosition: 4,
          Status: [CVR.ContestSelectionStatus.NeedsAdjudication],
          SelectionPosition: [
            expect.objectContaining({
              IsAllocable: CVR.AllocationStatus.Unknown,
              CVRWriteIn: expect.objectContaining({
                Text: 'GREG',
                WriteInImage: undefined,
              }),
            }),
          ],
        },
      ],
    });
  });

  test('assumes contests without votes are undervoted', () => {
    const result = buildCVRContestsFromVotes({
      contests: [fishingContest],
      votes: {},
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Undervotes: 1,
    });
  });

  test('ignores votes outside of the contest list', () => {
    const result = buildCVRContestsFromVotes({
      contests: [fishingContest],
      votes: {
        [mammalCouncilContest.id]: mammalCouncilContest.candidates.slice(0, 3),
      },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      ContestId: fishingContest.id,
    });
  });
});

test('hasWriteIns', () => {
  expect(hasWriteIns({ fishing: ['yes'] })).toEqual(false);
  expect(
    hasWriteIns({
      council: [
        {
          id: 'zebra',
          name: 'Zebra',
        },
      ],
    })
  ).toEqual(false);
  expect(
    hasWriteIns({
      council: [
        {
          id: 'write-in-0',
          name: 'Write In #0',
          isWriteIn: true,
        },
      ],
    })
  ).toEqual(true);
});

// Mock the contests on each side of the ballot
jest.mock('./page_layouts', () => {
  return {
    ...jest.requireActual('./page_layouts'),
    getBallotPageLayout: () => 'notLayout',
    getContestsForBallotPage: ({
      ballotPageMetadata,
    }: {
      ballotPageMetadata: BallotPageMetadata;
    }) =>
      ballotPageMetadata.pageNumber === 1
        ? [bestFishContest, fishCouncilContest]
        : [fishingContest],
  };
});

const electionId = electionHash;
const scannerId = 'SC-00-000';
const batchId = 'batch-1';
const castVoteRecordId = unsafeParse(BallotIdSchema, '1234');
const definiteMarkThreshold = 0.15;

test('buildCastVoteRecord - BMD ballot', () => {
  const castVoteRecord = buildCastVoteRecord({
    election,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotMarkingMode: 'machine',
    interpretation: interpretedBmdPage,
  });

  // check metadata
  expect(castVoteRecord).toMatchObject({
    BallotStyleId: interpretedBmdPage.metadata.ballotStyleId,
    BallotStyleUnitId: interpretedBmdPage.metadata.precinctId,
    PartyIds: ['1'],
    CreatingDeviceId: scannerId,
    ElectionId: electionId,
    BatchId: batchId,
    UniqueId: castVoteRecordId,
    vxBallotType: 'standard',
  });

  expect(castVoteRecord.CurrentSnapshotId).toEqual(
    `${castVoteRecordId}-original`
  );
  expect(castVoteRecord.CVRSnapshot).toHaveLength(1);
  const snapshot = castVoteRecord.CVRSnapshot[0]!;
  expect(snapshot.Type).toEqual(CVR.CVRType.Original);
  // There should be a CVRContest for every contest in the ballot style
  expect(snapshot.CVRContest).toHaveLength(
    getContests({
      ballotStyle: getBallotStyle({ election, ballotStyleId: '2F' })!,
      election,
    }).length
  );
});

describe('buildCastVoteRecord - HMPB Ballot', () => {
  const castVoteRecord = buildCastVoteRecord({
    election,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotMarkingMode: 'hand',
    pages: [
      {
        interpretation: interpretedHmpbPage1,
      },
      {
        interpretation: interpretedHmpbPage2,
      },
    ],
    definiteMarkThreshold,
    ballotPageLayoutsLookup: [],
  });

  test('includes correct metadata, including sheet number as BallotSheetId', () => {
    expect(castVoteRecord).toMatchObject({
      BallotStyleId: interpretedHmpbPage1.metadata.ballotStyleId,
      BallotStyleUnitId: interpretedHmpbPage1.metadata.precinctId,
      PartyIds: ['1'],
      CreatingDeviceId: scannerId,
      ElectionId: electionId,
      BatchId: batchId,
      UniqueId: castVoteRecordId,
      vxBallotType: 'standard',
      BallotSheetId: '1',
    });

    expect(castVoteRecord.CVRSnapshot).toHaveLength(2);
    expect(castVoteRecord.CurrentSnapshotId).toEqual('1234-modified');
  });

  test('includes original mark snapshot with OptionPosition and with HasIndication based on the definite mark threshold', () => {
    const originalSnapshot = find(
      castVoteRecord.CVRSnapshot,
      (snapshot) => snapshot['@id'] === `${castVoteRecordId}-original`
    );
    expect(originalSnapshot.Type).toEqual(CVR.CVRType.Original);
    assert(originalSnapshot.CVRContest);
    expect(originalSnapshot.CVRContest).toHaveLength(2);
    const fishCouncilContestOriginalSnapshot = find(
      originalSnapshot.CVRContest,
      (CVRContest) => CVRContest.ContestId === fishCouncilContest.id
    );
    expect(
      fishCouncilContestOriginalSnapshot.CVRContestSelection
    ).toMatchObject([
      {
        ContestSelectionId: 'manta-ray',
        OptionPosition: 0,
        SelectionPosition: [
          {
            HasIndication: CVR.IndicationStatus.Yes,
            MarkMetricValue: ['0.16'],
          },
        ],
      },
    ]);
    const fishingContestOriginalSnapshot = find(
      originalSnapshot.CVRContest,
      (CVRContest) => CVRContest.ContestId === fishingContest.id
    );
    expect(fishingContestOriginalSnapshot.CVRContestSelection).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          ContestSelectionId: 'no',
          OptionPosition: 1,
          SelectionPosition: [
            expect.objectContaining({
              HasIndication: CVR.IndicationStatus.Yes,
              MarkMetricValue: ['0.17'],
            }),
          ],
        }),
        expect.objectContaining({
          ContestSelectionId: 'yes',
          OptionPosition: 0,
          SelectionPosition: [
            expect.objectContaining({
              HasIndication: CVR.IndicationStatus.No,
              MarkMetricValue: ['0.03'],
            }),
          ],
        }),
      ])
    );
  });

  test('includes contests results for all contests in the layout, not just those with votes', () => {
    const modifiedSnapshot = find(
      castVoteRecord.CVRSnapshot,
      (snapshot) => snapshot['@id'] === `${castVoteRecordId}-modified`
    );
    expect(modifiedSnapshot.Type).toEqual(CVR.CVRType.Modified);
    expect(modifiedSnapshot.CVRContest).toHaveLength(3);
  });
});

test('buildCastVoteRecord - HMPB ballot with write-in images', () => {
  const castVoteRecord = buildCastVoteRecord({
    election,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotMarkingMode: 'hand',
    pages: [
      {
        interpretation: interpretedHmpbPage1,
        inlineBallotImage: {
          normalized: 'normalized',
        },
      },
      {
        interpretation: interpretedHmpbPage2,
      },
    ],
    definiteMarkThreshold,
    ballotPageLayoutsLookup: [],
  });

  expect(castVoteRecord.BallotImage).toMatchInlineSnapshot(`
    Array [
      Object {
        "@type": "CVR.ImageData",
        "Image": Object {
          "@type": "CVR.Image",
          "Data": "normalized",
        },
      },
      Object {
        "@type": "CVR.ImageData",
      },
    ]
  `);
  expect(castVoteRecord.vxLayouts).toMatchInlineSnapshot(`
    Array [
      "notLayout",
      null,
    ]
  `);
});
