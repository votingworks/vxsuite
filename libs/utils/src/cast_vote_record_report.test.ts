import { CVR } from '@votingworks/types';
import {
  convertCastVoteRecordVotesToTabulationVotes,
  getCurrentSnapshot,
} from './cast_vote_record_report';

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
