import * as fc from 'fast-check';
import { sha256 } from 'js-sha256';
import { find } from '@votingworks/basics';
import {
  ballotPaperDimensions,
  getBallotStyle,
  getCandidateParties,
  getCandidatePartiesDescription,
  getContestDistrictName,
  getContests,
  getContestsFromIds,
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
} from './election';
import { safeParse, safeParseJson, unsafeParse } from './generic';
import {
  testCdfBallotDefinition,
  testVxfElection,
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
            partyId: election.parties[0].id,
          })),
          ...candidateContest.candidates.map((c) => ({
            ...c,
            id: `${c.id}-noparty`,
            partyId: undefined,
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
          candidate.id.endsWith('-noparty')
            ? undefined
            : [election.parties[0].id]
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
    normalizeVxfAfterCdfConversion(testVxfElection)
  );
  expect(
    safeParseElection(JSON.stringify(testCdfBallotDefinition)).unsafeUnwrap()
  ).toEqual(normalizeVxfAfterCdfConversion(testVxfElection));
});

test('safeParseElection shows VXF and CDF parsing errors', () => {
  // Try an election that doesn't parse as either
  const error = safeParseElection({}).unsafeUnwrapErr();
  expect(error.message).toContain('Invalid election definition');
  expect(error.message).toContain('VXF error:');
  expect(error.message).toContain('CDF error:');
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
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Custom18)).toEqual({
    width: 8.5,
    height: 18,
  });
  expect(ballotPaperDimensions(HmpbBallotPaperSize.Custom21)).toEqual({
    width: 8.5,
    height: 21,
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
