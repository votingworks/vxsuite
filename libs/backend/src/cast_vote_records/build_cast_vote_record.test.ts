import { assert, find } from '@votingworks/basics';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  BallotIdSchema,
  BallotType,
  CandidateContest,
  CVR,
  unsafeParse,
} from '@votingworks/types';
import { getCastVoteRecordBallotType } from '@votingworks/utils';
import {
  fishCouncilContest,
  fishingContest,
  interpretedBmdPage,
  interpretedHmpbPage1,
  interpretedHmpbPage1WithUnmarkedWriteIn,
  interpretedHmpbPage1WithWriteIn,
  interpretedHmpbPage2,
} from '../../test/fixtures/interpretations';
import {
  buildCastVoteRecord,
  buildCVRContestsFromVotes,
  getOptionPosition,
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

describe('getOptionPosition', () => {
  test('handles option position for ballot measure contests', () => {
    const contest = fishingContest;
    expect(
      getOptionPosition({ contest, optionId: contest.yesOption.id })
    ).toEqual(0);
    expect(
      getOptionPosition({ contest, optionId: contest.noOption.id })
    ).toEqual(1);
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
      electionDefinition,
      votes: { [fishingContest.id]: [fishingContest.yesOption.id] },
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
      votes: { [fishingContest.id]: [fishingContest.noOption.id] },
      options: { ballotMarkingMode: 'machine' },
    });

    expect(result).toHaveLength(1);
    const cvrContest = result[0];
    expect(cvrContest).toMatchObject({
      Overvotes: 0,
      Undervotes: 0,
      CVRContestSelection: [
        expect.objectContaining({
          ContestSelectionId: fishingContest.noOption.id,
          OptionPosition: 1,
          SelectionPosition: [expect.anything()],
        }),
      ],
    });
  });

  test('ballot measure contest is correct for overvote', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
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

  test('candidate contest includes appropriate information for HMPB write-in', () => {
    const result = buildCVRContestsFromVotes({
      electionDefinition,
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
const definiteMarkThreshold = 0.15;

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
    BallotAuditId: ballotAuditId,
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
  expect(castVoteRecordWithImageReferences.BallotAuditId).toBeUndefined();
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
    definiteMarkThreshold,
    includeOriginalSnapshots: true,
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
    definiteMarkThreshold,
    includeOriginalSnapshots: true,
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
    definiteMarkThreshold,
    includeOriginalSnapshots: true,
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
    (snapshot) => snapshot.Type === CVR.CVRType.Modified
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
        HasIndication: CVR.IndicationStatus.No,
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

describe('hash manipulation', () => {
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
