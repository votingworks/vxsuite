/* eslint-disable vx/gts-identifiers */
import { CVR } from '@votingworks/types';
import {
  getCurrentSnapshot,
  getWriteInsFromCastVoteRecord,
  isBmdWriteIn,
} from './cast_vote_record_helpers';

const mockCastVoteRecord: CVR.CVR = {
  '@type': 'CVR.CVR',
  BallotStyleId: '0',
  BallotStyleUnitId: '0',
  BatchId: '0',
  CreatingDeviceId: '0',
  CurrentSnapshotId: '0',
  ElectionId: '0',
  UniqueId: '0',
  vxBallotType: CVR.vxBallotType.Precinct,
  BallotImage: [
    { '@type': 'CVR.ImageData', Location: 'front.jpg' },
    { '@type': 'CVR.ImageData', Location: 'back.jpg' },
  ],
  CVRSnapshot: [],
};

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
            ],
          },
        ],
      })
    ).toEqual([
      { contestId: 'animals', optionId: 'write-in-0', side: 'front' },
      { contestId: 'animals', optionId: 'write-in-1', side: 'front' },
      { contestId: 'flowers', optionId: 'write-in-0', side: 'back' },
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
    ).toEqual([{ contestId: 'animals', optionId: 'write-in-0' }]);
  });

  test('HMPB lacks top-level ballot image references', () => {
    expect(
      getWriteInsFromCastVoteRecord({
        ...mockCastVoteRecord,
        BallotImage: undefined,
        CVRSnapshot: [getMockSnapshotWithWriteIn('front.jpg')],
      })
    ).toEqual([{ contestId: 'animals', optionId: 'write-in-0' }]);
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
    ).toEqual([{ contestId: 'animals', optionId: 'write-in-0' }]);
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
    ).toEqual([{ contestId: 'animals', optionId: 'write-in-0' }]);
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
