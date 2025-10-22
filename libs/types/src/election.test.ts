import { expect, test } from 'vitest';
import * as fc from 'fast-check';
import { sha256 } from 'js-sha256';
import { assert, find, ok } from '@votingworks/basics';
import {
  ballotPaperDimensions,
  getBallotStyle,
  getCandidateParties,
  getCandidatePartiesDescription,
  getContestDistrictName,
  getContests,
  getContestsFromIds,
  getContestsWithGridLayoutOrder,
  formatBallotHash,
  getDistrictIdsForPartyId,
  getPartyAbbreviationByPartyId,
  getPartyFullNameFromBallotStyle,
  getPartyIdsInBallotStyles,
  getPartyIdsWithContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  getPrecinctIndexById,
  isVotePresent,
  validateVotes,
  vote,
  formatElectionPackageHash,
  formatElectionHashes,
  getGroupIdFromBallotStyleId,
  getPrecinctSplitById,
  getAllPrecinctsAndSplits,
} from './election_utils';
import {
  election,
  electionTwoPartyPrimary,
  primaryElection,
} from '../test/election';
import {
  BallotIdSchema,
  HmpbBallotPaperSize,
  BallotStyleId,
  BallotStyleSchema,
  CandidateContest,
  CandidateSchema,
  ElectionDefinitionSchema,
  PartyIdSchema,
  WriteInIdSchema,
  YesNoContest,
  BmdBallotPaperSize,
  hasSplits,
  DistrictId,
  Precinct,
  Election,
} from './election';
import { safeParse, safeParseJson, unsafeParse } from './generic';
import {
  testCdfBallotDefinition,
  testVxfElectionWithGridLayouts,
} from './cdf/ballot-definition/fixtures';
import {
  safeParseElection,
  safeParseElectionDefinition,
} from './election_parsing';
import { normalizeVxfAfterCdfConversion } from '../test/cdf_conversion_helpers';

test('can build votes from a candidate ID', () => {
  const contests = election.contests.filter((c) => c.id === 'CC');
  const contest = contests[0] as CandidateContest;

  expect(vote(contests, { CC: 'C' })).toEqual({
    CC: [contest.candidates[0]],
  });
});

test('can build votes from an array of candidate IDs', () => {
  const contests = election.contests.filter((c) => c.id === 'CC');
  const contest = contests[0] as CandidateContest;

  expect(
    vote(contests, { [contest.id]: contest.candidates.map((c) => c.id) })
  ).toEqual({
    [contest.id]: contest.candidates,
  });
});

test('can build votes from yesno values', () => {
  const yesNoContest = find(election.contests, (c) => c.id === 'YNC');
  expect(vote([yesNoContest], { YNC: ['option-yes'] })).toEqual({
    YNC: ['option-yes'],
  });
  expect(vote([yesNoContest], { YNC: ['option-no'] })).toEqual({
    YNC: ['option-no'],
  });
});

test('can build votes from a candidate object', () => {
  const contests = election.contests.filter((c) => c.id === 'CC');
  const contest = contests[0] as CandidateContest;
  const candidate = contest.candidates[0];

  expect(vote(contests, { CC: candidate })).toEqual({
    CC: [candidate],
  });
});

test('can build votes from a candidates array', () => {
  const contests = election.contests.filter((c) => c.id === 'CC');
  const contest = contests[0] as CandidateContest;
  const { candidates } = contest;

  expect(vote(contests, { CC: candidates })).toEqual({
    CC: candidates,
  });
});

test('vote throws when given a contest id that does not match a contest', () => {
  expect(() => vote([], { nope: 'yes-option' })).toThrowError(
    'unknown contest specified in vote shorthand'
  );
});

test('vote fills in empty votes', () => {
  const contests = election.contests.filter((c) => c.id === 'CC');

  expect(vote(contests, {})).toEqual({
    CC: [],
  });
});

test('can get a party primary adjective from ballot style', () => {
  const ballotStyleId = '1D' as BallotStyleId;
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic');
});

test('can get a party abbreviation by party ID', () => {
  expect(
    getPartyAbbreviationByPartyId({
      partyId: primaryElection.parties[0].id,
      election: { ...primaryElection },
    })
  ).toEqual('D');

  expect(
    getPartyAbbreviationByPartyId({
      partyId: primaryElection.parties[0].id,
      election: { ...primaryElection, parties: [] },
    })
  ).toEqual('');
});

test('can get a party full name from ballot style', () => {
  const ballotStyleId = '1D' as BallotStyleId;
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic Party');
});

test('failing to get a full party name returns an empty string', () => {
  const ballotStyleId = 'DOES_NOT_EXIST' as BallotStyleId;
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('');
});

test('special cases party primary adjective transform "Democrat" -> "Democratic"', () => {
  const ballotStyleId = '1D' as BallotStyleId;
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic');
});

test('defaults to empty string if no party can be found', () => {
  const ballotStyleId = 'bogus' as BallotStyleId;
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: {
        ...election,
        parties: [],
      },
    })
  ).toEqual('');
});

test('getPrecinctById', () => {
  expect(
    getPrecinctById({ election, precinctId: election.precincts[0].id })
  ).toEqual(election.precincts[0]);
  expect(getPrecinctById({ election, precinctId: '' })).toBeUndefined();
});

test('getPrecinctIndexById', () => {
  expect(
    getPrecinctIndexById({ election, precinctId: election.precincts[0].id })
  ).toEqual(0);
  expect(getPrecinctIndexById({ election, precinctId: '' })).toEqual(-1);
});

test('getPrecinctSplitById', () => {
  const precinct = testVxfElectionWithGridLayouts.precincts[0];
  assert(hasSplits(precinct));
  expect(
    getPrecinctSplitById({
      election: testVxfElectionWithGridLayouts,
      precinctSplitId: 'precinct-1-split-1',
    })
  ).toEqual({
    ...precinct.splits[0],
    precinctId: precinct.id,
  });
  expect(
    getPrecinctSplitById({
      election: testVxfElectionWithGridLayouts,
      precinctSplitId: 'precinct-1-split-2',
    })
  ).toEqual({
    ...precinct.splits[1],
    precinctId: precinct.id,
  });
});

test('getDistrictIdsForPartyId', () => {
  for (const party of electionTwoPartyPrimary.parties) {
    const ballotStylesByParty = electionTwoPartyPrimary.ballotStyles.filter(
      ({ partyId }) => party.id === partyId
    );
    for (const districtId of getDistrictIdsForPartyId(
      electionTwoPartyPrimary,
      party.id
    )) {
      expect(
        ballotStylesByParty.some(({ districts }) =>
          districts.includes(districtId)
        )
      ).toEqual(true);
    }
  }
});

test('getPartyIdsInBallotStyles', () => {
  expect(getPartyIdsInBallotStyles(electionTwoPartyPrimary)).toEqual(
    electionTwoPartyPrimary.parties.map(({ id }) => id)
  );
});

test('getGroupIdFromBallotStyleId', () => {
  expect(
    getGroupIdFromBallotStyleId({
      ballotStyleId: '1' as BallotStyleId,
      election,
    })!
  ).toEqual('1');
});

test('getContests', () => {
  // general election ballot
  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '1' as BallotStyleId,
        election,
      })!,
      election,
    }).map((c) => c.id)
  ).toEqual(['CC', 'YNC']);

  // primary ballots without non-partisan races
  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '1M' as BallotStyleId,
        election: electionTwoPartyPrimary,
      })!,
      election: electionTwoPartyPrimary,
    }).map((c) => c.id)
  ).toEqual(['best-animal-mammal', 'zoo-council-mammal', 'fishing']);

  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '2F' as BallotStyleId,
        election: electionTwoPartyPrimary,
      })!,
      election: electionTwoPartyPrimary,
    }).map((c) => c.id)
  ).toEqual(['best-animal-fish', 'aquarium-council-fish', 'fishing']);
});

test('getContestsFromIds', () => {
  expect(getContestsFromIds(electionTwoPartyPrimary, [])).toEqual([]);
  expect(
    getContestsFromIds(electionTwoPartyPrimary, ['best-animal-mammal'])
  ).toEqual([electionTwoPartyPrimary.contests[0]]);
  expect(
    getContestsFromIds(electionTwoPartyPrimary, [
      'best-animal-mammal',
      'best-animal-mammal',
    ])
  ).toEqual([electionTwoPartyPrimary.contests[0]]);
  expect(() =>
    getContestsFromIds(electionTwoPartyPrimary, ['not-a-contest-id'])
  ).toThrowError('Contest not-a-contest-id not found');
});

test('getPartyIdsWithContests', () => {
  expect(getPartyIdsWithContests(election)).toMatchObject([undefined]);
  expect(getPartyIdsWithContests(electionTwoPartyPrimary)).toMatchObject([
    '0',
    '1',
    undefined,
  ]);
});

test('getContestDistrictName', () => {
  expect(
    getContestDistrictName(
      electionTwoPartyPrimary,
      electionTwoPartyPrimary.contests[0]
    )
  ).toEqual('District 1');
});

test('isVotePresent', () => {
  expect(isVotePresent()).toEqual(false);
  expect(isVotePresent([])).toEqual(false);
  expect(isVotePresent(['option-yes'])).toEqual(true);
  expect(
    isVotePresent([
      election.contests.find(
        (c): c is CandidateContest => c.type === 'candidate'
      )!.candidates[0],
    ])
  ).toEqual(true);
});

test('validates votes by checking that contests are present in a given ballot style', () => {
  const ballotStyle = election.ballotStyles[0];

  const yesno = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  ) as YesNoContest;
  expect(() =>
    validateVotes({
      votes: {
        [yesno.id]: [yesno.yesOption.id],
      },
      ballotStyle,
      election,
    })
  ).not.toThrowError();
  expect(() =>
    validateVotes({ votes: { nope: ['yes-option'] }, ballotStyle, election })
  ).toThrowError(
    'found a vote with contest id "nope", but no such contest exists in ballot style 1'
  );
});

test('candidate schema', () => {
  // invalid IDs
  safeParse(CandidateSchema, { id: '', name: 'Empty' }).unsafeUnwrapErr();
  safeParse(CandidateSchema, {
    id: '_abc',
    name: 'Starts with underscore',
  }).unsafeUnwrapErr();
  safeParse(CandidateSchema, {
    id: 'write-in',
    name: 'Not a write-in',
    isWriteIn: false,
  }).unsafeUnwrapErr();
  safeParse(CandidateSchema, {
    id: 'some-id',
    name: 'Invalid write-in value',
    isWriteIn: true,
  }).unsafeUnwrapErr();
  // valid IDs
  safeParse(CandidateSchema, {
    id: 'bob-loblaw',
    name: 'Bob Loblaw',
  }).unsafeUnwrap();
  safeParse(CandidateSchema, {
    id: 'write-in',
    name: 'Write-in',
    isWriteIn: true,
  }).unsafeUnwrap();

  expect(
    safeParse(CandidateSchema, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      firstName: 'Bob',
      middleName: 'Lob',
      lastName: 'Loblaw',
    })
  ).toEqual(
    ok({
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      firstName: 'Bob',
      middleName: 'Lob',
      lastName: 'Loblaw',
    })
  );

  expect(
    safeParse(CandidateSchema, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      firstName: '',
      middleName: '',
      lastName: '',
    })
  ).toEqual(
    ok({
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
    })
  );
});

test('write-in ID schema', () => {
  // invalid IDs
  safeParse(WriteInIdSchema, '').unsafeUnwrapErr();
  safeParse(WriteInIdSchema, 'abc').unsafeUnwrapErr();
  safeParse(WriteInIdSchema, '__write-in').unsafeUnwrapErr();
  safeParse(WriteInIdSchema, 'writein').unsafeUnwrapErr();

  // valid IDs
  safeParse(WriteInIdSchema, 'write-in').unsafeUnwrap();
  safeParse(WriteInIdSchema, 'write-in-BOB').unsafeUnwrap();
  safeParse(WriteInIdSchema, 'write-in-1-BOB').unsafeUnwrap();
});

test('ballot ID schema', () => {
  // invalid IDs
  safeParse(BallotIdSchema, '').unsafeUnwrapErr();
  safeParse(BallotIdSchema, '_').unsafeUnwrapErr();

  // valid IDs
  safeParse(BallotIdSchema, 'abc').unsafeUnwrap();
  safeParse(BallotIdSchema, 'abc-123').unsafeUnwrap();
});

test('election schema', () => {
  safeParseElection(electionTwoPartyPrimary).unsafeUnwrap();

  fc.assert(
    fc.property(fc.anything(), (value) => {
      safeParseElection(value).unsafeUnwrapErr();
    })
  );

  const candidateContest = election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;
  const yesnoContest = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  )!;
  const parsedElection = safeParseElection({
    ...election,
    contests: [
      {
        ...candidateContest,
        candidates: [
          ...candidateContest.candidates.map((c) => ({
            ...c,
            partyIds: [election.parties[0].id],
          })),
          ...candidateContest.candidates.map((c) => ({
            ...c,
            id: `${c.id}-noparty`,
            partyIds: [],
          })),
        ],
      },
      yesnoContest,
    ],
  }).unsafeUnwrap();

  for (const contest of parsedElection.contests) {
    if (contest.type === 'candidate') {
      for (const candidate of contest.candidates) {
        expect(candidate.partyIds).toEqual(
          candidate.id.endsWith('-noparty') ? [] : [election.parties[0].id]
        );
      }
    }
  }
});

test('getCandidateParties', () => {
  expect(
    getCandidateParties(election.parties, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
    })
  ).toEqual([]);

  expect(
    getCandidateParties(election.parties, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      partyIds: election.parties.map(({ id }) => id),
    })
  ).toEqual(election.parties);

  expect(() =>
    getCandidateParties(election.parties, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      partyIds: [unsafeParse(PartyIdSchema, 'not-a-listed-party')],
    })
  ).toThrowError(/not-a-listed-party/);
});

test('getCandidatePartiesDescription', () => {
  expect(
    getCandidatePartiesDescription(election, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
    })
  ).toEqual(undefined);

  expect(
    getCandidatePartiesDescription(election, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      partyIds: election.parties.map(({ id }) => id),
    })
  ).toEqual(election.parties.map(({ name }) => name).join(', '));

  expect(() =>
    getCandidatePartiesDescription(election, {
      id: 'bob-loblaw',
      name: 'Bob Loblaw',
      partyIds: [unsafeParse(PartyIdSchema, 'not-a-listed-party')],
    })
  ).toThrowError(/not-a-listed-party/);
});

test('ElectionDefinitionSchema', () => {
  const electionData = JSON.stringify(election);

  expect(() => {
    unsafeParse(ElectionDefinitionSchema, {
      ballotHash: 'abc',
      electionData,
      election: electionTwoPartyPrimary,
    });
  }).toThrowError(/hash/);

  expect(
    unsafeParse(ElectionDefinitionSchema, {
      ballotHash: sha256(electionData),
      electionData,
      election,
    }).election
  ).toEqual(election);
});

test('BallotStyleSchema with ballot style languages', () => {
  const ballotStyle = {
    districts: ['district1', 'district2'],
    id: 'ballotStyle1_en_es-US',
    groupId: 'ballotStyle1',
    languages: ['en', 'es-US'],
    precincts: ['precinct1', 'precinct2'],
  } as const;

  const ballotStyleJson = JSON.stringify(ballotStyle);

  expect(
    safeParseJson(ballotStyleJson, BallotStyleSchema).unsafeUnwrap()
  ).toEqual(ballotStyle);
});

test('formatBallotHash', () => {
  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify(election)
  ).unsafeUnwrap();
  expect(electionDefinition.ballotHash).toContain(
    formatBallotHash(electionDefinition.ballotHash)
  );
  expect(formatBallotHash('1234567890abcdef')).toEqual('1234567');
});

test('formatElectionPackageHash', () => {
  expect(formatElectionPackageHash('1234567890abcdef')).toEqual('1234567');
});

test('formatElectionHashes', () => {
  expect(
    formatElectionHashes('00000000000000000000', '11111111111111111111')
  ).toEqual('0000000-1111111');
});

test('safeParseElection converts CDF to VXF', () => {
  expect(safeParseElection(testCdfBallotDefinition).unsafeUnwrap()).toEqual(
    normalizeVxfAfterCdfConversion(testVxfElectionWithGridLayouts)
  );
  expect(
    safeParseElection(JSON.stringify(testCdfBallotDefinition)).unsafeUnwrap()
  ).toEqual(normalizeVxfAfterCdfConversion(testVxfElectionWithGridLayouts));
});

test('safeParseElection shows VXF parsing errors by default', () => {
  // Try an election that doesn't parse as either VXF or CDF
  const error = safeParseElection({}).unsafeUnwrapErr();
  expect(error.message).toContain('Invalid election:');
  expect(error).toMatchSnapshot();
});

test('safeParseElection shows CDF parsing errors when input seems like it might be CDF', () => {
  const error = safeParseElection({
    ...testCdfBallotDefinition,
    GeneratedDate: 1,
  }).unsafeUnwrapErr();
  expect(error.message).toContain('Invalid CDF election:');
  expect(error).toMatchSnapshot();
});

test('ballotPaperDimensions', () => {
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Letter)).toEqual({
    width: 8.5,
    height: 11,
  });
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Legal)).toEqual({
    width: 8.5,
    height: 14,
  });
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Custom17)).toEqual({
    width: 8.5,
    height: 17,
  });
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Custom19)).toEqual({
    width: 8.5,
    height: 19,
  });
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Custom22)).toEqual({
    width: 8.5,
    height: 22,
  });
  expect(ballotPaperDimensions(BmdBallotPaperSize.Vsap150Thermal)).toEqual({
    width: 8,
    height: 13.25,
  });
});

test('hasSplits', () => {
  const districtIds: DistrictId[] = ['district-1' as DistrictId];
  const precincts = [
    {
      id: 'precinct-1',
      name: 'Precinct 1',
      splits: [
        {
          districtIds,
          id: 'split-a',
          name: 'Split A',
          clerkSignatureCaption: 'Signature',
          electionTitleOverride: 'Title',
        },
      ],
    },
    {
      id: 'precinct-2',
      name: 'Precinct 2',
      districtIds,
    },
  ];

  expect(hasSplits(precincts[0])).toEqual(true);
  expect(hasSplits(precincts[1])).toEqual(false);
});

test('getAllPrecinctsAndSplits', () => {
  expect(getAllPrecinctsAndSplits(election)).toEqual([
    { precinct: election.precincts[0] },
  ]);
  const precinct2: Precinct = {
    id: 'precinct-2',
    name: 'Precinct 2',
    splits: [
      {
        id: 'split-1',
        name: 'Split 1',
        districtIds: ['district-1' as DistrictId],
      },
      {
        id: 'split-2',
        name: 'Split 2',
        districtIds: ['district-2' as DistrictId],
      },
    ],
  };
  expect(
    getAllPrecinctsAndSplits({
      ...election,
      precincts: [...election.precincts, precinct2],
    })
  ).toEqual([
    { precinct: election.precincts[0] },
    { precinct: precinct2, split: precinct2.splits[0] },
    { precinct: precinct2, split: precinct2.splits[1] },
  ]);
});

test('getAllPrecinctsAndSplits sorts with numeric-aware locale comparison', () => {
  const precinct1: Precinct = {
    id: 'precinct-1',
    name: '1 - North',
    districtIds: ['district-1' as DistrictId],
  };
  const precinct10: Precinct = {
    id: 'precinct-10',
    name: '10 - Center',
    splits: [
      {
        id: 'split-10a',
        name: '10A - East',
        districtIds: ['district-1' as DistrictId],
      },
      {
        id: 'split-10b',
        name: '10B - West',
        districtIds: ['district-1' as DistrictId],
      },
    ],
  };
  const precinct2: Precinct = {
    id: 'precinct-2',
    name: '2 - South',
    districtIds: ['district-1' as DistrictId],
  };

  const result = getAllPrecinctsAndSplits({
    ...election,
    precincts: [precinct10, precinct1, precinct2],
  });

  // Verify numeric sort: 1, 2, 10A, 10B (not lexicographic: 1, 10A, 10B, 2)
  expect(result).toEqual([
    { precinct: precinct1 },
    { precinct: precinct2 },
    { precinct: precinct10, split: precinct10.splits[0] },
    { precinct: precinct10, split: precinct10.splits[1] },
  ]);
});

test('getContestsWithGridLayoutOrder returns contests in election order when no gridLayouts exist', () => {
  const ballotStyle = election.ballotStyles[0]!;
  const contests = getContestsWithGridLayoutOrder({
    ballotStyle,
    election,
  });

  // Should return contests in the same order as getContests
  const expectedContests = getContests({ ballotStyle, election });
  expect(contests).toEqual(expectedContests);
});

test('getContestsWithGridLayoutOrder returns contests in gridLayout order when gridLayouts exist', () => {
  // Create a modified election where gridLayouts have different orders than the natural election order
  // Natural election order: contest-1 (Mayor), contest-2 (Proposition 1), contest-3 (Controller)
  // Natural candidate order in contest-1: candidate-1 (Sherlock Holmes), candidate-2 (Thomas Edison)

  // We'll create gridLayouts with different orders:
  // Ballot style 1_en: contest-2 first, then contest-1 with reversed candidates
  // Ballot style 3_en: contest-3 first, then contest-1, then contest-2 with normal candidates

  const modifiedElection: Election = {
    ...testVxfElectionWithGridLayouts,
    gridLayouts: [
      {
        // Ballot style 1_en: Proposition 1 first, then Mayor with reversed candidates
        ballotStyleId: '1_en' as BallotStyleId,
        optionBoundsFromTargetMark: { bottom: 1, left: 1, right: 9, top: 1 },
        gridPositions: [
          // contest-2 (Proposition 1) comes first
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-2',
            column: 2,
            row: 10,
            optionId: 'contest-2-option-yes',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-2',
            column: 2,
            row: 11,
            optionId: 'contest-2-option-no',
          },
          // contest-1 (Mayor) comes second with reversed candidates
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-1',
            column: 2,
            row: 20,
            optionId: 'candidate-2',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-1',
            column: 2,
            row: 21,
            optionId: 'candidate-1',
          },
        ],
      },
      {
        // Keep ballot style 2_en unchanged
        ballotStyleId: '2_en' as BallotStyleId,
        optionBoundsFromTargetMark: { bottom: 1, left: 1, right: 9, top: 1 },
        gridPositions: [
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-3',
            column: 2,
            row: 12,
            optionId: 'candidate-3',
          },
        ],
      },
      {
        // Ballot style 3_en: Controller first, then Mayor, then Proposition 1
        ballotStyleId: '3_en' as BallotStyleId,
        optionBoundsFromTargetMark: { bottom: 1, left: 1, right: 9, top: 1 },
        gridPositions: [
          // contest-3 (Controller) comes first
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-3',
            column: 2,
            row: 5,
            optionId: 'candidate-3',
          },
          // contest-1 (Mayor) comes second with normal candidate order
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-1',
            column: 2,
            row: 10,
            optionId: 'candidate-1',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-1',
            column: 2,
            row: 11,
            optionId: 'candidate-2',
          },
          // contest-2 (Proposition 1) comes last
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-2',
            column: 2,
            row: 20,
            optionId: 'contest-2-option-yes',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-2',
            column: 2,
            row: 21,
            optionId: 'contest-2-option-no',
          },
        ],
      },
      {
        // Keep ballot style 3_es-US the same as 3_en
        ballotStyleId: '3_es-US' as BallotStyleId,
        optionBoundsFromTargetMark: { bottom: 1, left: 1, right: 9, top: 1 },
        gridPositions: [
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-3',
            column: 2,
            row: 5,
            optionId: 'candidate-3',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-1',
            column: 2,
            row: 10,
            optionId: 'candidate-1',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-1',
            column: 2,
            row: 11,
            optionId: 'candidate-2',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-2',
            column: 2,
            row: 20,
            optionId: 'contest-2-option-yes',
          },
          {
            type: 'option',
            sheetNumber: 1,
            side: 'front',
            contestId: 'contest-2',
            column: 2,
            row: 21,
            optionId: 'contest-2-option-no',
          },
        ],
      },
    ],
  };

  // Test ballot style 1_en: should have contest-2 first, then contest-1 with reversed candidates
  const ballotStyle1 = modifiedElection.ballotStyles.find(
    (bs) => bs.id === ('1_en' as BallotStyleId)
  )!;
  const contests1 = getContestsWithGridLayoutOrder({
    ballotStyle: ballotStyle1,
    election: modifiedElection,
  });
  console.log(contests1);

  expect(contests1.map((c) => c.id)).toEqual(['contest-2', 'contest-1']);
  const mayorContest1 = contests1[1] as CandidateContest;
  expect(mayorContest1.candidates.map((c) => c.id)).toEqual([
    'candidate-2', // Thomas Edison first per gridLayout
    'candidate-1', // Sherlock Holmes second per gridLayout
  ]);

  // Test ballot style 3_en: should have contest-3, contest-1, contest-2 with normal candidates
  const ballotStyle3 = modifiedElection.ballotStyles.find(
    (bs) => bs.id === ('3_en' as BallotStyleId)
  )!;
  const contests3 = getContestsWithGridLayoutOrder({
    ballotStyle: ballotStyle3,
    election: modifiedElection,
  });

  expect(contests3.map((c) => c.id)).toEqual([
    'contest-3',
    'contest-1',
    'contest-2',
  ]);
  const mayorContest3 = contests3[1] as CandidateContest;
  expect(mayorContest3.candidates.map((c) => c.id)).toEqual([
    'candidate-1', // Sherlock Holmes first per gridLayout
    'candidate-2', // Thomas Edison second per gridLayout
  ]);
});
