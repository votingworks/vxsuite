import {
  electionWithMsEitherNeither,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';
import {
  AnyContest,
  BallotIdSchema,
  BallotMetadata,
  BallotType,
  CandidateContest,
  getBallotStyle,
  getContests,
  unsafeParse,
  vote,
  YesNoContest,
} from '@votingworks/types';
import {
  buildCastVoteRecord,
  getCvrBallotType,
  getOptionIdsForContestVote,
  getWriteInOptionIdsForContestVote,
} from './build';

const { election, electionDefinition } = electionFamousNames2021Fixtures;

const candidateContest = electionWithMsEitherNeither.contests.find(
  (contest): contest is CandidateContest => contest.type === 'candidate'
)!;
const yesnoContest = electionWithMsEitherNeither.contests.find(
  (contest): contest is YesNoContest => contest.type === 'yesno'
)!;

test('getCvrBallotType', () => {
  expect(getCvrBallotType(BallotType.Absentee)).toEqual('absentee');
  expect(getCvrBallotType(BallotType.Provisional)).toEqual('provisional');
  expect(getCvrBallotType(BallotType.Standard)).toEqual('standard');
  expect(() => getCvrBallotType(-1)).toThrowError('Illegal Value: -1');
});

test('getWriteInOptionIdsForContestVote', () => {
  expect(getWriteInOptionIdsForContestVote(candidateContest, {})).toEqual([]);
  expect(
    getWriteInOptionIdsForContestVote(
      { ...candidateContest, allowWriteIns: true },
      {}
    )
  ).toEqual([]);
  expect(
    getWriteInOptionIdsForContestVote(
      {
        ...candidateContest,
        allowWriteIns: true,
      },
      {
        [candidateContest.id]: [
          { id: 'write-in-0', name: 'BOB', isWriteIn: true },
        ],
      }
    )
  ).toEqual(['write-in-0']);
  expect(getWriteInOptionIdsForContestVote(yesnoContest, {})).toEqual([]);
  expect(() =>
    getWriteInOptionIdsForContestVote(
      {
        ...yesnoContest,
        type: 'not-supported-type',
      } as unknown as AnyContest,
      {}
    )
  ).toThrowError('Illegal Value: not-supported-type');
});

test('getOptionIdsForContestVote', () => {
  expect(getOptionIdsForContestVote(candidateContest, {})).toEqual([]);
  expect(
    getOptionIdsForContestVote(
      candidateContest,
      vote(electionWithMsEitherNeither.contests, {
        [candidateContest.id]: [candidateContest.candidates[0].id],
      })
    )
  ).toEqual([[candidateContest.id, candidateContest.candidates[0].id]]);
  expect(
    getOptionIdsForContestVote(
      yesnoContest,
      vote(electionWithMsEitherNeither.contests, {
        [yesnoContest.id]: ['yes'],
      })
    )
  ).toEqual([[yesnoContest.id, 'yes']]);
  expect(() =>
    getOptionIdsForContestVote(
      {
        ...yesnoContest,
        type: 'not-supported-type',
      } as unknown as AnyContest,
      {}
    )
  ).toThrowError('Illegal Value: not-supported-type');
});

test('generates a CVR from a completed BMD ballot', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!;
  const contests = getContests({ ballotStyle, election });
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId,
    isTestMode: false,
  };

  expect(
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedBmdPage',
          ballotId,
          metadata,
          votes: vote(contests, {
            mayor: 'sherlock-holmes',
            controller: 'winston-churchill',
          }),
        },
      },
      {
        interpretation: {
          type: 'BlankPage',
        },
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_batchId": "1234",
      "_batchLabel": "Batch 1",
      "_precinctId": "20",
      "_scannerId": "000",
      "_testBallot": false,
      "attorney": Array [],
      "board-of-alderman": Array [],
      "chief-of-police": Array [],
      "city-council": Array [],
      "controller": Array [
        "winston-churchill",
      ],
      "mayor": Array [
        "sherlock-holmes",
      ],
      "parks-and-recreation-director": Array [],
      "public-works-director": Array [],
    }
  `);
});
test('generates a CVR from a completed BMD ballot with write in and overvotes', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!;
  const contests = getContests({ ballotStyle, election });
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId,
    isTestMode: false,
  };

  expect(
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedBmdPage',
          ballotId,
          metadata,
          votes: vote(contests, {
            mayor: {
              id: 'write-in-PIKACHU',
              name: 'Pikachu',
              isWriteIn: true,
            },
            controller: ['oprah-winfrey', 'winston-churchill'],
          }),
        },
      },
      {
        interpretation: {
          type: 'BlankPage',
        },
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_batchId": "1234",
      "_batchLabel": "Batch 1",
      "_precinctId": "20",
      "_scannerId": "000",
      "_testBallot": false,
      "attorney": Array [],
      "board-of-alderman": Array [],
      "chief-of-police": Array [],
      "city-council": Array [],
      "controller": Array [
        "winston-churchill",
        "oprah-winfrey",
      ],
      "mayor": Array [
        "write-in-PIKACHU",
      ],
      "parks-and-recreation-director": Array [],
      "public-works-director": Array [],
    }
  `);
});

test('generates a CVR from a completed HMPB page', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!;
  const contests = getContests({ ballotStyle, election });
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId,
    isTestMode: false,
  };

  expect(
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId,
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          votes: vote(contests, {
            mayor: 'sherlock-holmes',
            controller: 'louis-armstrong',
          }),
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
        contestIds: ['mayor', 'controller'],
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId,
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          votes: vote(contests, {}),
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 2,
            },
            contests: [],
          },
        },
        contestIds: [],
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_batchId": "1234",
      "_batchLabel": "Batch 1",
      "_precinctId": "20",
      "_scannerId": "000",
      "_testBallot": false,
      "controller": Array [
        "louis-armstrong",
      ],
      "mayor": Array [
        "sherlock-holmes",
      ],
    }
  `);
});

test('generates a CVR from a completed HMPB page with write in votes and overvotes', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!;
  const contests = getContests({ ballotStyle, election });
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId,
    isTestMode: false,
  };

  expect(
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId,
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          votes: vote(contests, {
            mayor: { id: 'write-in-0', name: 'Pikachu', isWriteIn: true },
            controller: ['winston-churchill', 'oprah-winfrey'],
          }),
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
        contestIds: ['mayor', 'controller'],
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId,
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: electionDefinition.electionHash,
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          votes: vote(contests, {}),
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 2,
            },
            contests: [],
          },
        },
        contestIds: [],
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_batchId": "1234",
      "_batchLabel": "Batch 1",
      "_precinctId": "20",
      "_scannerId": "000",
      "_testBallot": false,
      "controller": Array [
        "winston-churchill",
        "oprah-winfrey",
      ],
      "mayor": Array [
        "write-in-0",
      ],
    }
  `);
});

test('fails to generate a CVR from an invalid HMPB sheet with two pages having the same page number', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId,
    isTestMode: false,
  };

  expect(() =>
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have consecutive page numbers, but got front=1 back=1'
  );
});

test('fails to generate a CVR from an invalid HMPB sheet with two non-consecutive pages', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId,
    isTestMode: false,
  };

  expect(() =>
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 3,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 3,
            },
            contests: [],
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have consecutive page numbers, but got front=1 back=3'
  );
});

test('fails to generate a CVR from an invalid HMPB sheet with different ballot styles', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId: '1',
    precinctId,
    isTestMode: false,
  };

  expect(() =>
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 2,
            },
            contests: [],
          },
        },
      },
    ])
  ).toThrowError();
});

test('fails to generate a CVR from an invalid HMPB sheet with different precincts', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const batchId = '1234';
  const batchLabel = 'Batch 1';
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash: electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId,
    precinctId: '6522',
    isTestMode: false,
  };

  expect(() =>
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 1,
            },
            contests: [],
          },
        },
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
          layout: {
            pageSize: { width: 1, height: 1 },
            metadata: {
              ...metadata,
              pageNumber: 2,
            },
            contests: [],
          },
        },
      },
    ])
  ).toThrowError();
});

test('fails to generate CVRs from blank pages', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const batchId = '1234';
  const batchLabel = 'Batch 1';

  expect(
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      { interpretation: { type: 'BlankPage' } },
      { interpretation: { type: 'BlankPage' } },
    ])
  ).toBeUndefined();
});

test('fails to generate CVRs from invalid test mode pages', () => {
  const sheetId = 'sheetid';
  const ballotId = unsafeParse(BallotIdSchema, 'abcdefg');
  const ballotStyleId = '1';
  const precinctId = '20';
  const batchId = '1234';
  const batchLabel = 'Batch 1';

  expect(
    buildCastVoteRecord(sheetId, batchId, batchLabel, ballotId, election, [
      {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: electionDefinition.electionHash,
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
          },
        },
      },
      { interpretation: { type: 'BlankPage' } },
    ])
  ).toBeUndefined();
});
