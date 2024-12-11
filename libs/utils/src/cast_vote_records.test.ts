import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dirSync } from 'tmp';
import { BallotType, CVR } from '@votingworks/types';

import {
  buildCVRSnapshotBallotTypeMetadata,
  convertCastVoteRecordVotesToTabulationVotes,
  getCastVoteRecordBallotType,
  getCurrentSnapshot,
  getExportedCastVoteRecordIds,
  getWriteInsFromCastVoteRecord,
  isBmdWriteIn,
  isCastVoteRecordWriteInValid,
} from './cast_vote_records';

const mockCastVoteRecord: CVR.CVR = {
  '@type': 'CVR.CVR',
  BallotStyleId: '0',
  BallotStyleUnitId: '0',
  BatchId: '0',
  CreatingDeviceId: '0',
  CurrentSnapshotId: '0',
  ElectionId: '0',
  UniqueId: '0',
  BallotImage: [
    { '@type': 'CVR.ImageData', Location: 'front.jpg' },
    { '@type': 'CVR.ImageData', Location: 'back.jpg' },
  ],
  CVRSnapshot: [],
};

let tempDirectoryPath: string;

beforeEach(() => {
  tempDirectoryPath = dirSync().name;
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

describe('getCurrentSnapshot', () => {
  test('happy path', () => {
    const expectedSnapshot: CVR.CVRSnapshot = {
      '@type': 'CVR.CVRSnapshot',
      '@id': '1',
      Type: CVR.CVRType.Modified,
      CVRContest: [],
    };

    const actualSnapshot = getCurrentSnapshot({
      ...mockCastVoteRecord,
      CurrentSnapshotId: '1',
      CVRSnapshot: [
        expectedSnapshot,
        {
          '@type': 'CVR.CVRSnapshot',
          '@id': '0',
          Type: CVR.CVRType.Original,
          CVRContest: [],
        },
      ],
    });

    expect(actualSnapshot).toEqual(expectedSnapshot);
  });

  test('missing snapshot', () => {
    expect(
      getCurrentSnapshot({
        ...mockCastVoteRecord,
        CVRSnapshot: [],
      })
    ).toBeUndefined();
  });
});

describe('convertCastVoteRecordVotesToTabulationVotes', () => {
  test('snapshot without contests', () => {
    expect(
      convertCastVoteRecordVotesToTabulationVotes({
        '@id': 'test',
        '@type': 'CVR.CVRSnapshot',
        Type: CVR.CVRType.Modified,
        CVRContest: [],
      })
    ).toMatchObject({});
  });

  test('converts snapshot', () => {
    expect(
      convertCastVoteRecordVotesToTabulationVotes({
        '@id': 'test',
        '@type': 'CVR.CVRSnapshot',
        Type: CVR.CVRType.Modified,
        CVRContest: [
          {
            '@type': 'CVR.CVRContest',
            ContestId: 'mayor',
            CVRContestSelection: [
              {
                '@type': 'CVR.CVRContestSelection',
                ContestSelectionId: 'frodo',
                SelectionPosition: [
                  {
                    '@type': 'CVR.SelectionPosition',
                    HasIndication: CVR.IndicationStatus.Yes,
                    NumberVotes: 1,
                  },
                ],
              },
              {
                '@type': 'CVR.CVRContestSelection',
                ContestSelectionId: 'gandalf',
                SelectionPosition: [
                  {
                    '@type': 'CVR.SelectionPosition',
                    HasIndication: CVR.IndicationStatus.Yes,
                    NumberVotes: 1,
                  },
                ],
              },
              {
                '@type': 'CVR.CVRContestSelection',
                ContestSelectionId: 'sam',
                SelectionPosition: [
                  {
                    '@type': 'CVR.SelectionPosition',
                    // should be ignored because not indicated
                    HasIndication: CVR.IndicationStatus.No,
                    NumberVotes: 1,
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toEqual({ mayor: ['frodo', 'gandalf'] });
  });
});

describe('getWriteInsFromCastVoteRecord', () => {
  test('HMPB happy path', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        CVRSnapshot: [
          {
            '@type': 'CVR.CVRSnapshot',
            '@id': '0',
            Type: CVR.CVRType.Modified,
            CVRContest: [
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'animals',
                CVRContestSelection: [
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-0',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.Yes,
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          WriteInImage: {
                            '@type': 'CVR.ImageData',
                            Location: 'front.jpg',
                          },
                        },
                      },
                    ],
                  },
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-1',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.Yes,
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          WriteInImage: {
                            '@type': 'CVR.ImageData',
                            Location: 'front.jpg',
                          },
                        },
                      },
                    ],
                  },
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-2',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.No,
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          WriteInImage: {
                            '@type': 'CVR.ImageData',
                            Location: 'front.jpg',
                          },
                        },
                      },
                    ],
                  },
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'dog',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.Yes,
                        NumberVotes: 1,
                      },
                    ],
                  },
                ],
              },
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'flowers',
                CVRContestSelection: [
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-0',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.Yes,
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          WriteInImage: {
                            '@type': 'CVR.ImageData',
                            Location: 'back.jpg',
                          },
                        },
                      },
                    ],
                  },
                ],
              },
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'tractors',
                CVRContestSelection: [
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-0',
                    Status: [CVR.ContestSelectionStatus.NeedsAdjudication],
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.No,
                        IsAllocable: CVR.AllocationStatus.Unknown,
                        Status: [CVR.PositionStatus.Other],
                        OtherStatus: 'unmarked-write-in',
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          WriteInImage: {
                            '@type': 'CVR.ImageData',
                            Location: 'back.jpg',
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toEqual([
      {
        contestId: 'animals',
        optionId: 'write-in-0',
        side: 'front',
        isUnmarked: false,
      },
      {
        contestId: 'animals',
        optionId: 'write-in-1',
        side: 'front',
        isUnmarked: false,
      },
      {
        contestId: 'flowers',
        optionId: 'write-in-0',
        side: 'back',
        isUnmarked: false,
      },
      {
        contestId: 'tractors',
        optionId: 'write-in-0',
        side: 'back',
        isUnmarked: true,
      },
    ]);
  });

  function getMockSnapshotWithWriteIn(
    writeInLocation?: string
  ): CVR.CVRSnapshot {
    return {
      '@type': 'CVR.CVRSnapshot',
      '@id': '0',
      Type: CVR.CVRType.Modified,
      CVRContest: [
        {
          '@type': 'CVR.CVRContest',
          ContestId: 'animals',
          CVRContestSelection: [
            {
              '@type': 'CVR.CVRContestSelection',
              ContestSelectionId: 'write-in-0',
              SelectionPosition: [
                {
                  '@type': 'CVR.SelectionPosition',
                  HasIndication: CVR.IndicationStatus.Yes,
                  NumberVotes: 1,
                  CVRWriteIn: {
                    '@type': 'CVR.CVRWriteIn',
                    WriteInImage: {
                      '@type': 'CVR.ImageData',
                      Location: writeInLocation,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  test('HMPB image reference mismatch', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        CVRSnapshot: [getMockSnapshotWithWriteIn('bad.jpg')],
      })
    ).toEqual([
      { contestId: 'animals', optionId: 'write-in-0', isUnmarked: false },
    ]);
  });

  test('HMPB lacks top-level ballot image references', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        BallotImage: undefined,
        CVRSnapshot: [getMockSnapshotWithWriteIn('front.jpg')],
      })
    ).toEqual([
      { contestId: 'animals', optionId: 'write-in-0', isUnmarked: false },
    ]);
  });

  test('HMPB top-level ballot image reference lacks locations', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        BallotImage: [
          { '@type': 'CVR.ImageData' },
          { '@type': 'CVR.ImageData' },
        ],
        CVRSnapshot: [getMockSnapshotWithWriteIn(undefined)],
      })
    ).toEqual([
      { contestId: 'animals', optionId: 'write-in-0', isUnmarked: false },
    ]);
  });

  test('HMPB write-in image reference lacks location', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        BallotImage: [
          { '@type': 'CVR.ImageData' },
          { '@type': 'CVR.ImageData' },
        ],
        CVRSnapshot: [getMockSnapshotWithWriteIn()],
      })
    ).toEqual([
      { contestId: 'animals', optionId: 'write-in-0', isUnmarked: false },
    ]);
  });

  test('BMD path', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        BallotImage: undefined,
        CVRSnapshot: [
          {
            '@type': 'CVR.CVRSnapshot',
            '@id': '0',
            Type: CVR.CVRType.Modified,
            CVRContest: [
              {
                '@type': 'CVR.CVRContest',
                ContestId: 'animals',
                CVRContestSelection: [
                  {
                    '@type': 'CVR.CVRContestSelection',
                    ContestSelectionId: 'write-in-0',
                    SelectionPosition: [
                      {
                        '@type': 'CVR.SelectionPosition',
                        HasIndication: CVR.IndicationStatus.Yes,
                        NumberVotes: 1,
                        CVRWriteIn: {
                          '@type': 'CVR.CVRWriteIn',
                          Text: 'Dog',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toEqual([{ contestId: 'animals', optionId: 'write-in-0', text: 'Dog' }]);
  });
});

test('isBmdWriteIn', () => {
  expect(isBmdWriteIn({ '@type': 'CVR.CVRWriteIn', Text: 'Greg' })).toEqual(
    true
  );

  expect(
    isBmdWriteIn({
      '@type': 'CVR.CVRWriteIn',
      WriteInImage: { '@type': 'CVR.ImageData', Location: 'file:' },
    })
  ).toEqual(false);
});

test('getExportedCastVoteRecordIds', async () => {
  const exportDirectoryPath = tempDirectoryPath;
  fs.mkdirSync(path.join(exportDirectoryPath, '1'));
  fs.mkdirSync(path.join(exportDirectoryPath, '2'));
  fs.mkdirSync(path.join(exportDirectoryPath, '3'));
  fs.writeFileSync(path.join(exportDirectoryPath, '0'), '');

  const castVoteRecordIds =
    await getExportedCastVoteRecordIds(exportDirectoryPath);
  expect([...castVoteRecordIds].sort()).toEqual(['1', '2', '3']);
});

test('isCastVoteRecordWriteInValid', () => {
  expect(
    isCastVoteRecordWriteInValid({
      contestId: 'contest-0',
      optionId: 'option-0',
    })
  ).toBeFalsy();
  expect(
    isCastVoteRecordWriteInValid({
      contestId: 'contest-0',
      optionId: 'option-0',
      side: 'front',
    })
  ).toBeTruthy();
  expect(
    isCastVoteRecordWriteInValid({
      contestId: 'contest-0',
      optionId: 'option-0',
      text: 'Mr. Magic',
    })
  ).toBeTruthy();
});

test('buildCVRSnapshotBallotTypeMetadata', () => {
  expect(buildCVRSnapshotBallotTypeMetadata(BallotType.Precinct)).toEqual({
    Status: [CVR.CVRStatus.Other],
    OtherStatus: '{"ballotType":"precinct"}',
  });
});

test('getCastVoteRecordBallotType', () => {
  const snapshot: CVR.CVRSnapshot = {
    '@type': 'CVR.CVRSnapshot',
    '@id': '0',
    Type: CVR.CVRType.Modified,
    CVRContest: [],
  };

  const cvr: CVR.CVR = {
    '@type': 'CVR.CVR',
    BallotStyleId: '0',
    BallotStyleUnitId: '0',
    BatchId: '0',
    CreatingDeviceId: '0',
    CurrentSnapshotId: '0',
    ElectionId: '0',
    UniqueId: '0',
    BallotImage: [
      { '@type': 'CVR.ImageData', Location: 'front.jpg' },
      { '@type': 'CVR.ImageData', Location: 'back.jpg' },
    ],
    CVRSnapshot: [],
  };

  function buildMockCvr({
    otherStatus,
    status,
  }: {
    otherStatus?: string;
    status?: CVR.CVRStatus[];
  }): CVR.CVR {
    return {
      ...cvr,
      CVRSnapshot: [
        {
          ...snapshot,
          Status: status,
          OtherStatus: otherStatus,
        },
      ],
    };
  }

  // missing snapshot
  expect(getCastVoteRecordBallotType(cvr)).toBeUndefined();
  // "Status" undefined
  expect(getCastVoteRecordBallotType(buildMockCvr({}))).toBeUndefined();
  // "Status" doesn't include "Other"
  expect(
    getCastVoteRecordBallotType(buildMockCvr({ status: [] }))
  ).toBeUndefined();
  // "Status" includes "Other" but "OtherStatus" is undefined
  expect(
    getCastVoteRecordBallotType(buildMockCvr({ status: [CVR.CVRStatus.Other] }))
  ).toBeUndefined();
  // bad JSON
  expect(
    getCastVoteRecordBallotType(
      buildMockCvr({ status: [CVR.CVRStatus.Other], otherStatus: '{sdfasd' })
    )
  ).toBeUndefined();
  // bad schema
  expect(
    getCastVoteRecordBallotType(
      buildMockCvr({
        status: [CVR.CVRStatus.Other],
        otherStatus: '{"ballotType":"early"}',
      })
    )
  ).toBeUndefined();

  expect(
    getCastVoteRecordBallotType(
      buildMockCvr({
        status: [CVR.CVRStatus.Other],
        otherStatus: '{"ballotType":"precinct"}',
      })
    )
  ).toEqual(BallotType.Precinct);
});
