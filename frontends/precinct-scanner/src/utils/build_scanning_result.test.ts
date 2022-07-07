import {
  AdjudicationReason,
  BallotMetadata,
  BallotPageInfo,
  BallotType,
} from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import {
  RejectedScanningReason,
  ScanningResult,
  ScanningResultType,
} from '../config/types';
import { buildScanningResult } from './build_scanning_result';

function tryBothOrderings<T>(
  front: T,
  back: T,
  fn: (front: T, back: T) => void
) {
  fn(front, back);
  fn(back, front);
}

const metadata: BallotMetadata = {
  ballotStyleId: 'ballot-style-id',
  precinctId: 'precinct-id',
  ballotType: BallotType.Standard,
  electionHash: 'abcdef',
  isTestMode: true,
  locales: { primary: 'en-US' },
};

test('invalid election hash', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InvalidElectionHashPage',
      expectedElectionHash: 'abcdef',
      actualElectionHash: '123456',
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InvalidElectionHashPage',
      expectedElectionHash: 'abcdef',
      actualElectionHash: '123456',
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Rejected,
        rejectionReason: RejectedScanningReason.InvalidElectionHash,
      })
    );
  });
});

test('invalid test mode', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InvalidTestModePage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InvalidTestModePage',
      metadata: {
        ...metadata,
        pageNumber: 2,
      },
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Rejected,
        rejectionReason: RejectedScanningReason.InvalidTestMode,
      })
    );
  });
});

test('unreadable', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'UnreadablePage',
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'UnreadablePage',
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Rejected,
        rejectionReason: RejectedScanningReason.Unreadable,
      })
    );
  });
});

test('invalid precinct', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InvalidPrecinctPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InvalidPrecinctPage',
      metadata: {
        ...metadata,
        pageNumber: 2,
      },
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Rejected,
        rejectionReason: RejectedScanningReason.InvalidPrecinct,
      })
    );
  });
});

test('BMD ballot', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedBmdPage',
      metadata,
      votes: {},
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'BlankPage',
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Accepted,
      })
    );
  });
});

test('BMD + HMPB nonsense ballot', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedBmdPage',
      metadata,
      votes: {},
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'front-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Rejected,
        rejectionReason: RejectedScanningReason.Unknown,
      })
    );
  });
});

test('HMPB blank ballot', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [AdjudicationReason.BlankBallot],
        enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [AdjudicationReason.BlankBallot],
        enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.NeedsReview,
        adjudicationReasonInfo: [{ type: AdjudicationReason.BlankBallot }],
      })
    );
  });
});

test('HMPB without issues', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.Accepted,
      })
    );
  });
});

test('HMPB with overvoted p1 & blank p2', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [
          AdjudicationReason.Overvote,
          AdjudicationReason.BlankBallot,
        ],
        enabledReasonInfos: [
          {
            type: AdjudicationReason.Overvote,
            contestId: 'contest-id',
            expected: 1,
            optionIds: ['option-1', 'option-2'],
            optionIndexes: [0, 1],
          },
        ],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [
          AdjudicationReason.Overvote,
          AdjudicationReason.BlankBallot,
        ],
        enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.NeedsReview,
        adjudicationReasonInfo: [
          {
            type: AdjudicationReason.Overvote,
            contestId: 'contest-id',
            expected: 1,
            optionIds: ['option-1', 'option-2'],
            optionIndexes: [0, 1],
          },
        ],
      })
    );
  });
});

test('HMPB with undervotes', () => {
  const page1: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [
          AdjudicationReason.Overvote,
          AdjudicationReason.Undervote,
        ],
        enabledReasonInfos: [
          {
            type: AdjudicationReason.Undervote,
            contestId: 'page1-contest-id',
            expected: 1,
            optionIds: [],
            optionIndexes: [],
          },
        ],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'front-url',
    },
  };
  const page2: BallotPageInfo = {
    interpretation: {
      type: 'InterpretedHmpbPage',
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [],
      },
      votes: {},
      adjudicationInfo: {
        requiresAdjudication: true,
        enabledReasons: [
          AdjudicationReason.Overvote,
          AdjudicationReason.Undervote,
        ],
        enabledReasonInfos: [
          {
            type: AdjudicationReason.Undervote,
            contestId: 'page2-contest-id',
            expected: 1,
            optionIds: [],
            optionIndexes: [],
          },
        ],
        ignoredReasonInfos: [],
      },
    },
    image: {
      url: 'back-url',
    },
  };

  tryBothOrderings(page1, page2, (front, back) => {
    expect(
      buildScanningResult({
        id: 'sheet-id',
        front,
        back,
      })
    ).toStrictEqual(
      typedAs<ScanningResult>({
        resultType: ScanningResultType.NeedsReview,
        adjudicationReasonInfo: expect.arrayContaining([
          {
            type: AdjudicationReason.Undervote,
            contestId: 'page1-contest-id',
            expected: 1,
            optionIds: [],
            optionIndexes: [],
          },
          {
            type: AdjudicationReason.Undervote,
            contestId: 'page2-contest-id',
            expected: 1,
            optionIds: [],
            optionIndexes: [],
          },
        ]),
      })
    );
  });
});
