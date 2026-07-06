import { describe, expect, test } from 'vitest';
import { assert, find } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  readElectionStraightPartyDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  BallotIdSchema,
  BallotType,
  CandidateContest,
  CVR,
  MarkThresholds,
  unsafeParse,
} from '@votingworks/types';
import { getCastVoteRecordBallotType } from '@votingworks/utils';
import {
  fishCouncilContest,
  fishingContest,
  interpretedBmdPage1,
  interpretedBmdPage2,
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage1WithUnmarkedWriteIn,
  interpretedHmpbPage1WithWriteIn,
  interpretedHmpbPage2,
  interpretedHmpbPage2WithMarginalMark,
} from '../../test/fixtures/interpretations';
import {
  buildCastVoteRecord,
  buildCVRContestsFromVotes,
  combineImageAndLayoutHashes,
  getImageHash,
  getLayoutHash,
} from './build_cast_vote_record';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const { election } = electionDefinition;

const mammalCouncilContest = find(
  election.contests,
  (contest) => contest.id === 'zoo-council-mammal'
) as CandidateContest;

describe('buildCVRContestsFromVotes', () => {
  test('builds well-formed ballot measure contest (yes vote)', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: { [fishingContest.id]: [fishingContest.options[0].id] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchInlineSnapshot(`
      {
        "@type": "CVR.CVRContest",
        "CVRContestSelection": [
          {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "ban-fishing",
            "OptionPosition": 0,
            "SelectionPosition": [
              {
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
        "Overvotes": 0,
        "Status": undefined,
        "Undervotes": 0,
      }
    `);
  });

  test('ballot measure contest is correct for no vote', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: { [fishingContest.id]: [fishingContest.options[1].id] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 0,
      Undervotes: 0,
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: fishingContest.options[1].id,
          OptionPosition: 1,
          SelectionPosition: [expect.anything()],
        }),
      ],
    });
  });

  test('ballot measure contest is correct for overvote', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: { [fishingContest.id]: ['ban-fishing', 'allow-fishing'] },
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
      Undervotes: 0,
      CVRContestSelection: expect.anything(),
    });
    for (const contestSelection of cvrContest!.CVRContestSelection) {
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
      electionDefinition,
      ballotStyleId: '1M',
      votes: { [fishingContest.id]: [] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 0,
      Undervotes: 1,
      Status: expect.arrayContaining([
        CVR.ContestStatus.NotIndicated,
        CVR.ContestStatus.Undervoted,
      ]),
    });
  });

  test('builds well-formed candidate contest', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: {
        [mammalCouncilContest.id]: mammalCouncilContest.candidates.slice(0, 3),
      },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchInlineSnapshot(`
      {
        "@type": "CVR.CVRContest",
        "CVRContestSelection": [
          {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "zebra",
            "OptionPosition": 0,
            "SelectionPosition": [
              {
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
          {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "lion",
            "OptionPosition": 1,
            "SelectionPosition": [
              {
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
          {
            "@type": "CVR.CVRContestSelection",
            "ContestSelectionId": "kangaroo",
            "OptionPosition": 2,
            "SelectionPosition": [
              {
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
        "Overvotes": 0,
        "Status": undefined,
        "Undervotes": 0,
        "WriteIns": 0,
      }
    `);
  });

  test('candidate contest includes appropriate information when not indicated', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: { [mammalCouncilContest.id]: [] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 0,
      Undervotes: 3,
      Status: expect.arrayContaining([
        CVR.ContestStatus.NotIndicated,
        CVR.ContestStatus.Undervoted,
      ]),
    });
  });

  test('candidate contest includes appropriate information when undervoted', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: {
        [mammalCouncilContest.id]: [mammalCouncilContest.candidates[0]!],
      },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 0,
      Undervotes: 2,
      Status: expect.arrayContaining([CVR.ContestStatus.Undervoted]),
    });
  });

  test('candidate contest includes appropriate information when overvoted', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: {
        [mammalCouncilContest.id]: mammalCouncilContest.candidates.slice(0, 4),
      },
      options: { ballotMarkingMode: 'hand' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 3,
      Undervotes: 0,
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

  test('overvoted write-in has both InvalidatedRules and NeedsAdjudication status', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
      votes: {
        [mammalCouncilContest.id]: [
          ...mammalCouncilContest.candidates.slice(0, 3),
          { id: 'write-in-0', name: 'Write In', isWriteIn: true },
        ],
      },
      options: { ballotMarkingMode: 'hand' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    assert(cvrContest?.CVRContestSelection);
    const writeInSelection = cvrContest.CVRContestSelection.find(
      (s) => s.ContestSelectionId === 'write-in-0'
    );
    expect(writeInSelection).toMatchObject({
      Status: expect.arrayContaining([
        CVR.ContestSelectionStatus.InvalidatedRules,
        CVR.ContestSelectionStatus.NeedsAdjudication,
      ]),
    });
    const nonWriteInSelection = cvrContest.CVRContestSelection.find(
      (s) => s.ContestSelectionId !== 'write-in-0'
    );
    expect(nonWriteInSelection).toMatchObject({
      Status: [CVR.ContestSelectionStatus.InvalidatedRules],
    });
  });

  test('candidate contest includes appropriate information for HMPB write-in', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
      ballotStyleId: '1M',
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
        image: {
          imageHash: 'a',
          imageRelativePath: 'ballot-images/image',
          layoutFileHash: 'b',
        },
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
                  Hash: expect.objectContaining({
                    Type: CVR.HashType.Sha256,
                    Value: 'a-b',
                  }),
                  Location: 'file:ballot-images/image',
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
      electionDefinition,
      ballotStyleId: '1M',
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
});

const electionId = '0000000000'; // fixed for resiliency to hash change
const scannerId = 'SC-00-000';
const batchId = 'batch-1';
const indexInBatch = 19;
const ballotAuditId = `${batchId}_0023`;
const castVoteRecordId = unsafeParse(BallotIdSchema, '1234');
const markThresholds: MarkThresholds = { marginal: 0.05, definite: 0.15 };

test('buildCastVoteRecord - BMD ballot', () => {
  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotAuditId,
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
    // BallotAuditId comes from the per-page metadata for the unified BMD shape.
    BallotAuditId: interpretedBmdPage.metadata.ballotAuditId,
    BallotSheetId: interpretedBmdPage.metadata.pageNumber.toString(),
    BatchSequenceId: undefined,
    UniqueId: castVoteRecordId,
  });
  expect(getCastVoteRecordBallotType(castVoteRecord)).toEqual(
    BallotType.Precinct
  );

  expect(castVoteRecord.CurrentSnapshotId).toEqual(
    `${castVoteRecordId}-original`
  );
  expect(castVoteRecord.CVRSnapshot).toHaveLength(1);
  const snapshot = castVoteRecord.CVRSnapshot[0]!;
  expect(snapshot.Type).toEqual(CVR.CVRType.Original);
});

test('buildCastVoteRecord - multi-page BMD ballot page 1', () => {
  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotAuditId,
    ballotMarkingMode: 'machine',
    interpretation: interpretedBmdPage1,
  });

  // Check metadata
  expect(castVoteRecord).toMatchObject({
    BallotStyleId: interpretedBmdPage1.metadata.ballotStyleId,
    BallotStyleUnitId: interpretedBmdPage1.metadata.precinctId,
    PartyIds: ['1'],
    CreatingDeviceId: scannerId,
    ElectionId: electionId,
    BatchId: batchId,
    // BallotAuditId should come from the interpretation metadata for multi-page BMD
    BallotAuditId: interpretedBmdPage1.metadata.ballotAuditId,
    // BallotSheetId should be the page number
    BallotSheetId: '1',
    UniqueId: castVoteRecordId,
  });
  expect(getCastVoteRecordBallotType(castVoteRecord)).toEqual(
    BallotType.Precinct
  );

  expect(castVoteRecord.CurrentSnapshotId).toEqual(
    `${castVoteRecordId}-original`
  );
  expect(castVoteRecord.CVRSnapshot).toHaveLength(1);
  const snapshot = castVoteRecord.CVRSnapshot[0]!;
  expect(snapshot.Type).toEqual(CVR.CVRType.Original);

  // Only the contest for this page should be included
  expect(snapshot.CVRContest).toHaveLength(1);
  expect(snapshot.CVRContest?.[0]?.ContestId).toEqual(fishCouncilContest.id);
});

test('buildCastVoteRecord - multi-page BMD ballot page 2', () => {
  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotAuditId,
    ballotMarkingMode: 'machine',
    interpretation: interpretedBmdPage2,
  });

  // Check metadata
  expect(castVoteRecord).toMatchObject({
    BallotStyleId: interpretedBmdPage2.metadata.ballotStyleId,
    BallotStyleUnitId: interpretedBmdPage2.metadata.precinctId,
    // BallotAuditId should come from the interpretation metadata for multi-page BMD
    BallotAuditId: interpretedBmdPage2.metadata.ballotAuditId,
    // BallotSheetId should be the page number
    BallotSheetId: '2',
    UniqueId: castVoteRecordId,
  });

  expect(castVoteRecord.CVRSnapshot).toHaveLength(1);
  const snapshot = castVoteRecord.CVRSnapshot[0]!;

  // Only the contest for this page should be included
  expect(snapshot.CVRContest).toHaveLength(1);
  expect(snapshot.CVRContest?.[0]?.ContestId).toEqual(fishingContest.id);
});

test('buildCastVoteRecord - BMD ballot images', () => {
  const buildCastVoteRecordInput = {
    ballotMarkingMode: 'machine',
    batchId,
    castVoteRecordId,
    electionDefinition,
    electionId,
    interpretation: interpretedBmdPage,
    scannerId,
  } as const;

  const castVoteRecordWithoutImageReferences = buildCastVoteRecord(
    buildCastVoteRecordInput
  );
  expect(castVoteRecordWithoutImageReferences.BallotImage).toEqual(undefined);

  const castVoteRecordWithImageReferences = buildCastVoteRecord({
    ...buildCastVoteRecordInput,
    images: [
      {
        imageHash: 'a',
        imageRelativePath: 'ballot-images/front.jpg',
        layoutFileHash: 'b',
      },
      {
        imageHash: 'c',
        imageRelativePath: 'ballot-images/back.jpg',
        layoutFileHash: 'd',
      },
    ],
  });
  expect(castVoteRecordWithImageReferences.BallotAuditId).toEqual(
    interpretedBmdPage.metadata.ballotAuditId
  );
  expect(castVoteRecordWithImageReferences.BallotImage).toEqual([
    {
      '@type': 'CVR.ImageData',
      Hash: {
        '@type': 'CVR.Hash',
        Type: CVR.HashType.Sha256,
        Value: 'a-b',
      },
      Location: 'file:ballot-images/front.jpg',
    },
    {
      '@type': 'CVR.ImageData',
      Hash: {
        '@type': 'CVR.Hash',
        Type: CVR.HashType.Sha256,
        Value: 'c-d',
      },
      Location: 'file:ballot-images/back.jpg',
    },
  ]);
});

describe('buildCastVoteRecord - HMPB Ballot', () => {
  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotAuditId,
    indexInBatch,
    ballotMarkingMode: 'hand',
    interpretations: [interpretedHmpbPage1, interpretedHmpbPage2],
    markThresholds,
  });

  test('includes correct metadata, including sheet number as BallotSheetId', () => {
    expect(castVoteRecord).toMatchObject({
      BallotStyleId: interpretedHmpbPage1.metadata.ballotStyleId,
      BallotStyleUnitId: interpretedHmpbPage1.metadata.precinctId,
      PartyIds: ['1'],
      CreatingDeviceId: scannerId,
      ElectionId: electionId,
      BatchId: batchId,
      BatchSequenceId: indexInBatch,
      UniqueId: castVoteRecordId,
      BallotSheetId: '1',
      BallotAuditId: ballotAuditId,
    });
    expect(getCastVoteRecordBallotType(castVoteRecord)).toEqual(
      BallotType.Precinct
    );

    expect(castVoteRecord.CVRSnapshot).toHaveLength(2);
    expect(castVoteRecord.CurrentSnapshotId).toEqual('1234-interpreted');
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
          ContestSelectionId: 'allow-fishing',
          OptionPosition: 1,
          SelectionPosition: [
            expect.objectContaining({
              HasIndication: CVR.IndicationStatus.Yes,
              MarkMetricValue: ['0.17'],
            }),
          ],
        }),
        expect.objectContaining({
          ContestSelectionId: 'ban-fishing',
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

  test('original snapshot uses HasIndication unknown for marginal marks', () => {
    const cvr = buildCastVoteRecord({
      electionDefinition,
      electionId,
      castVoteRecordId,
      scannerId,
      batchId,
      ballotMarkingMode: 'hand',
      interpretations: [
        interpretedHmpbPage1,
        interpretedHmpbPage2WithMarginalMark,
      ],
      markThresholds,
    });
    const originalSnapshot = find(
      cvr.CVRSnapshot,
      (snapshot) => snapshot['@id'] === `${castVoteRecordId}-original`
    );
    const fishingContestSnapshot = find(
      originalSnapshot.CVRContest ?? [],
      (c) => c.ContestId === fishingContest.id
    );
    expect(fishingContestSnapshot.CVRContestSelection).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          ContestSelectionId: fishingContest.options[0].id,
          SelectionPosition: [
            expect.objectContaining({
              HasIndication: CVR.IndicationStatus.Unknown,
              MarkMetricValue: ['0.09'],
            }),
          ],
        }),
      ])
    );
  });
});

test('buildCastVoteRecord - HMPB ballot with write-in', () => {
  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotMarkingMode: 'hand',
    interpretations: [interpretedHmpbPage1WithWriteIn, interpretedHmpbPage2],
    images: [
      {
        imageHash: 'a',
        imageRelativePath: 'ballot-images/front.jpg',
        layoutFileHash: 'b',
      },
      {
        imageHash: 'c',
        imageRelativePath: 'ballot-images/back.jpg',
        layoutFileHash: 'd',
      },
    ],
    markThresholds,
  });

  expect(castVoteRecord.BallotImage).toEqual([
    {
      '@type': 'CVR.ImageData',
      Hash: {
        '@type': 'CVR.Hash',
        Type: CVR.HashType.Sha256,
        Value: 'a-b',
      },
      Location: 'file:ballot-images/front.jpg',
    },
    {
      '@type': 'CVR.ImageData',
      Hash: {
        '@type': 'CVR.Hash',
        Type: CVR.HashType.Sha256,
        Value: 'c-d',
      },
      Location: 'file:ballot-images/back.jpg',
    },
  ]);
});

test('buildCastVoteRecord - HMPB ballot with unmarked write-in', () => {
  const castVoteRecord = buildCastVoteRecord({
    electionDefinition,
    electionId,
    castVoteRecordId,
    scannerId,
    batchId,
    ballotMarkingMode: 'hand',
    interpretations: [
      interpretedHmpbPage1WithUnmarkedWriteIn,
      interpretedHmpbPage2,
    ],
    images: [
      {
        imageHash: 'a',
        imageRelativePath: 'ballot-images/front.jpg',
        layoutFileHash: 'b',
      },
      {
        imageHash: 'c',
        imageRelativePath: 'ballot-images/back.jpg',
        layoutFileHash: 'd',
      },
    ],
    markThresholds,
  });

  const expectedFrontImageData: CVR.ImageData = {
    '@type': 'CVR.ImageData',
    Hash: {
      '@type': 'CVR.Hash',
      Type: CVR.HashType.Sha256,
      Value: 'a-b',
    },
    Location: 'file:ballot-images/front.jpg',
  };

  const expectedBackImageData: CVR.ImageData = {
    '@type': 'CVR.ImageData',
    Hash: {
      '@type': 'CVR.Hash',
      Type: CVR.HashType.Sha256,
      Value: 'c-d',
    },
    Location: 'file:ballot-images/back.jpg',
  };

  expect(castVoteRecord.BallotImage).toEqual([
    expectedFrontImageData,
    expectedBackImageData,
  ]);

  const modifiedSnapshot = find(
    castVoteRecord.CVRSnapshot,
    (snapshot) => snapshot.Type === CVR.CVRType.Interpreted
  );

  const cvrFishCouncilContest = find(
    modifiedSnapshot.CVRContest,
    (c) => c.ContestId === 'aquarium-council-fish'
  );

  // unmarked write-in should be represented as undervote, not an explicit write-in
  expect(cvrFishCouncilContest.Undervotes).toEqual(2);
  expect(cvrFishCouncilContest.WriteIns).toEqual(0);

  const unmarkedWriteInSelection = find(
    cvrFishCouncilContest.CVRContestSelection,
    (cs) => cs.ContestSelectionId === 'write-in-1'
  );

  expect(unmarkedWriteInSelection).toEqual<CVR.CVRContestSelection>({
    '@type': 'CVR.CVRContestSelection',
    ContestSelectionId: 'write-in-1',
    OptionPosition: 5,
    Status: [CVR.ContestSelectionStatus.NeedsAdjudication],
    SelectionPosition: [
      {
        '@type': 'CVR.SelectionPosition',
        HasIndication: CVR.IndicationStatus.Unknown,
        NumberVotes: 1,
        IsAllocable: CVR.AllocationStatus.Unknown,
        Status: [CVR.PositionStatus.Other],
        OtherStatus: 'unmarked-write-in',
        CVRWriteIn: {
          '@type': 'CVR.CVRWriteIn',
          WriteInImage: expectedFrontImageData,
        },
      },
    ],
  });
});

describe('buildCVRContestsFromVotes with candidate rotation', () => {
  const famousNamesElectionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election: famousNamesElection } = famousNamesElectionDefinition;

  const mayorContest = find(
    famousNamesElection.contests,
    (contest) => contest.id === 'mayor'
  ) as CandidateContest;

  const boardOfAldermenContest = find(
    famousNamesElection.contests,
    (contest) => contest.id === 'board-of-alderman'
  ) as CandidateContest;

  test('OptionPosition reflects ballot style 1-1 rotation', () => {
    // Ballot style 1-1 order: john-snow (position 0), mark-twain (position 1)
    const result = buildCVRContestsFromVotes({
      electionDefinition: famousNamesElectionDefinition,
      ballotStyleId: '1-1',
      votes: {
        [mayorContest.id]: [
          find(mayorContest.candidates, (c) => c.id === 'sherlock-holmes'),
        ],
        [boardOfAldermenContest.id]: [
          find(
            boardOfAldermenContest.candidates,
            (c) => c.id === 'pablo-picasso'
          ),
          find(
            boardOfAldermenContest.candidates,
            (c) => c.id === 'vincent-van-gogh'
          ),
        ],
      },
      options: { ballotMarkingMode: 'hand' },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: 'sherlock-holmes',
          OptionPosition: 0, // a multi-endorsed candidate will always use the first appearing position
        }),
      ],
    });
    expect(result[1]).toMatchObject({
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: 'pablo-picasso',
          OptionPosition: 4,
        }),
        expect.objectContaining({
          ContestSelectionId: 'vincent-van-gogh',
          OptionPosition: 3,
        }),
      ],
    });

    // Make sure that a vote for a candidate after the multi-endorsed candidate has the proper index.
    const result2 = buildCVRContestsFromVotes({
      electionDefinition: famousNamesElectionDefinition,
      ballotStyleId: '1-1',
      votes: {
        [mayorContest.id]: [
          find(mayorContest.candidates, (c) => c.id === 'thomas-edison'),
        ],
      },
      options: { ballotMarkingMode: 'hand' },
    });
    expect(result2).toHaveLength(1);
    expect(result2[0]).toMatchObject({
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: 'thomas-edison',
          OptionPosition: 2,
        }),
      ],
    });
  });

  test('OptionPosition reflects ballot style 1-2 rotation', () => {
    // Ballot style 1-2 order: mark-twain (position 0), john-snow (position 1)
    // The positions are rotated compared to ballot style 1-1
    const result = buildCVRContestsFromVotes({
      electionDefinition: famousNamesElectionDefinition,
      ballotStyleId: '1-4',
      votes: {
        [mayorContest.id]: [
          find(mayorContest.candidates, (c) => c.id === 'sherlock-holmes'),
        ],
        [boardOfAldermenContest.id]: [
          find(
            boardOfAldermenContest.candidates,
            (c) => c.id === 'pablo-picasso'
          ),
          find(
            boardOfAldermenContest.candidates,
            (c) => c.id === 'vincent-van-gogh'
          ),
        ],
      },
      options: { ballotMarkingMode: 'hand' },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: 'sherlock-holmes',
          OptionPosition: 1, // a multi-endorsed candidate will always use the first appearing position
        }),
      ],
    });
    expect(result[1]).toMatchObject({
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: 'pablo-picasso',
          OptionPosition: 1,
        }),
        expect.objectContaining({
          ContestSelectionId: 'vincent-van-gogh',
          OptionPosition: 0,
        }),
      ],
    });
  });
});

describe('buildCVRContestsFromVotes with straight party contest', () => {
  const straightPartyElectionDefinition = readElectionStraightPartyDefinition();
  const straightPartyContestId = 'straight-party-ticket';
  const ballotStyleId = '12';

  test('single party selection', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition: straightPartyElectionDefinition,
      ballotStyleId,
      votes: { [straightPartyContestId]: ['3'] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<CVR.CVRContest>({
      '@type': 'CVR.CVRContest',
      ContestId: straightPartyContestId,
      Overvotes: 0,
      Undervotes: 0,
      Status: undefined,
      CVRContestSelection: [
        {
          '@type': 'CVR.CVRContestSelection',
          ContestSelectionId: '3',
          OptionPosition: 3,
          Status: undefined,
          SelectionPosition: [
            {
              '@type': 'CVR.SelectionPosition',
              HasIndication: CVR.IndicationStatus.Yes,
              NumberVotes: 1,
              IsAllocable: CVR.AllocationStatus.Yes,
              Status: undefined,
            },
          ],
        },
      ],
    });
  });

  test('undervote', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition: straightPartyElectionDefinition,
      ballotStyleId,
      votes: { [straightPartyContestId]: [] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<CVR.CVRContest>({
      '@type': 'CVR.CVRContest',
      ContestId: straightPartyContestId,
      Overvotes: 0,
      Undervotes: 1,
      Status: [CVR.ContestStatus.Undervoted, CVR.ContestStatus.NotIndicated],
      CVRContestSelection: [],
    });
  });

  test('overvote', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition: straightPartyElectionDefinition,
      ballotStyleId,
      votes: { [straightPartyContestId]: ['3', '7'] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<CVR.CVRContest>({
      '@type': 'CVR.CVRContest',
      ContestId: straightPartyContestId,
      Overvotes: 1,
      Undervotes: 0,
      Status: [CVR.ContestStatus.Overvoted, CVR.ContestStatus.InvalidatedRules],
      CVRContestSelection: [
        {
          '@type': 'CVR.CVRContestSelection',
          ContestSelectionId: '3',
          OptionPosition: 3,
          Status: [CVR.ContestSelectionStatus.InvalidatedRules],
          SelectionPosition: [
            {
              '@type': 'CVR.SelectionPosition',
              HasIndication: CVR.IndicationStatus.Yes,
              NumberVotes: 1,
              IsAllocable: CVR.AllocationStatus.No,
              Status: [CVR.PositionStatus.InvalidatedRules],
            },
          ],
        },
        {
          '@type': 'CVR.CVRContestSelection',
          ContestSelectionId: '7',
          OptionPosition: 7,
          Status: [CVR.ContestSelectionStatus.InvalidatedRules],
          SelectionPosition: [
            {
              '@type': 'CVR.SelectionPosition',
              HasIndication: CVR.IndicationStatus.Yes,
              NumberVotes: 1,
              IsAllocable: CVR.AllocationStatus.No,
              Status: [CVR.PositionStatus.InvalidatedRules],
            },
          ],
        },
      ],
    });
  });
});

test('hash manipulation', () => {
  expect(combineImageAndLayoutHashes('image')).toEqual('image');
  expect(combineImageAndLayoutHashes('image', 'layout')).toEqual(
    'image-layout'
  );

  const imageDataWithLayoutHash: CVR.ImageData = {
    '@type': 'CVR.ImageData',
    Hash: {
      '@type': 'CVR.Hash',
      Type: CVR.HashType.Sha256,
      Value: 'image-layout',
    },
  };
  const imageDataWithoutLayoutHash: CVR.ImageData = {
    '@type': 'CVR.ImageData',
    Hash: {
      '@type': 'CVR.Hash',
      Type: CVR.HashType.Sha256,
      Value: 'image',
    },
  };

  expect(getImageHash(imageDataWithLayoutHash)).toEqual('image');
  expect(getImageHash(imageDataWithoutLayoutHash)).toEqual('image');

  expect(getLayoutHash(imageDataWithLayoutHash)).toEqual('layout');
  expect(getLayoutHash(imageDataWithoutLayoutHash)).toBeUndefined();
});
