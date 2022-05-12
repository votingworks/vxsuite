import {
  BallotIdSchema,
  getDistrictIdsForPartyId,
  getPartyIdsInBallotStyles,
  safeParse,
  safeParseElection,
  WriteInIdSchema,
} from '.';
import {
  election,
  electionWithMsEitherNeither,
  primaryElection,
  electionMinimalExhaustive,
} from '../test/election';
import {
  CandidateContest,
  CandidateSchema,
  expandEitherNeitherContests,
  getContestsFromIds,
  getEitherNeitherContests,
  getElectionLocales,
  getPartyAbbreviationByPartyId,
  getPartyFullNameFromBallotStyle,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  getPrecinctIndexById,
  isVotePresent,
  PartySchema,
  validateVotes,
  vote,
  withLocale,
  YesNoContest,
} from './election';
import { unsafeParse } from './generic';

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
  expect(vote(election.contests, { YNC: 'yes' })).toEqual({
    YNC: 'yes',
  });
  expect(vote(election.contests, { YNC: 'no' })).toEqual({
    YNC: 'no',
  });
});

test('can build votes from ms-either-neither yesno values', () => {
  expect(
    vote(electionWithMsEitherNeither.contests, {
      MSEN: 'yes',
      MSPO: 'no',
    })
  ).toEqual({
    MSEN: 'yes',
    MSPO: 'no',
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

test('can get ms-either-neither contests from a list', () => {
  expect(
    getEitherNeitherContests(electionWithMsEitherNeither.contests)
  ).toHaveLength(1);
});

test('can expand ms-either-neither contests into yes no contests', () => {
  const expandedContests = expandEitherNeitherContests(
    electionWithMsEitherNeither.contests
  );
  // There is 1 contest that should have expanded into two.
  expect(expandedContests).toHaveLength(
    1 + electionWithMsEitherNeither.contests.length
  );
  for (let i = 0; i < electionWithMsEitherNeither.contests.length; i += 1) {
    const originalContest = electionWithMsEitherNeither.contests[i];
    if (originalContest.type !== 'ms-either-neither') {
      expect(originalContest).toEqual(expandedContests[i]);
    } else {
      expect(expandedContests[i].type).toBe('yesno');
      expect(expandedContests[i + 1].type).toBe('yesno');
    }
  }
});

test('can expand ms-either-neither contests into yes no contests in a primary', () => {
  const expandedContests = expandEitherNeitherContests(
    electionMinimalExhaustive.contests
  );
  // There is 1 contest that should have expanded into two.
  expect(expandedContests).toHaveLength(
    1 + electionMinimalExhaustive.contests.length
  );
  for (let i = 0; i < electionWithMsEitherNeither.contests.length; i += 1) {
    const originalContest = electionMinimalExhaustive.contests[i];
    if (originalContest.type !== 'ms-either-neither') {
      expect(originalContest).toEqual(expandedContests[i]);
    } else {
      expect(expandedContests[i].type).toBe('yesno');
      expect(expandedContests[i + 1].type).toBe('yesno');
      expect(expandedContests[i].partyId).toEqual(originalContest.partyId);
      expect(expandedContests[i + 1].partyId).toEqual(originalContest.partyId);
    }
  }
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
  expect(() => vote([], { nope: 'yes' })).toThrowError('unknown contest nope');
});

test('can get a party primary adjective from ballot style', () => {
  const ballotStyleId = '1D';
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
  const ballotStyleId = '1D';
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic Party');
});

test('failing to get a full party name returns an empty string', () => {
  const ballotStyleId = 'DOES_NOT_EXIST';
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('');
});

test('special cases party primary adjective transform "Democrat" -> "Democratic"', () => {
  const ballotStyleId = '1D';
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic');
});

test('defaults to empty string if no party can be found', () => {
  const ballotStyleId = 'bogus';
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
  ).toBe(election.precincts[0]);
  expect(getPrecinctById({ election, precinctId: '' })).toBeUndefined();
});

test('getPrecinctIndexById', () => {
  expect(
    getPrecinctIndexById({ election, precinctId: election.precincts[0].id })
  ).toBe(0);
  expect(getPrecinctIndexById({ election, precinctId: '' })).toBe(-1);
});

test('getDistrictIdsForPartyId', () => {
  for (const party of electionMinimalExhaustive.parties) {
    const ballotStylesByParty = electionMinimalExhaustive.ballotStyles.filter(
      ({ partyId }) => party.id === partyId
    );
    for (const districtId of getDistrictIdsForPartyId(
      electionMinimalExhaustive,
      party.id
    )) {
      expect(
        ballotStylesByParty.some(({ districts }) =>
          districts.includes(districtId)
        )
      ).toBe(true);
    }
  }
});

test('getPartyIdsInBallotStyles', () => {
  expect(getPartyIdsInBallotStyles(electionMinimalExhaustive)).toEqual(
    electionMinimalExhaustive.parties.map(({ id }) => id)
  );
});

test('getContestsFromIds', () => {
  expect(getContestsFromIds(electionMinimalExhaustive, [])).toEqual([]);
  expect(
    getContestsFromIds(electionMinimalExhaustive, ['best-animal-mammal'])
  ).toEqual([electionMinimalExhaustive.contests[0]]);
  expect(
    getContestsFromIds(electionMinimalExhaustive, [
      'best-animal-mammal',
      'best-animal-mammal',
    ])
  ).toEqual([electionMinimalExhaustive.contests[0]]);
  expect(() =>
    getContestsFromIds(electionMinimalExhaustive, ['not-a-contest-id'])
  ).toThrowError('Contest not-a-contest-id not found');
});

test('isVotePresent', () => {
  expect(isVotePresent()).toBe(false);
  expect(isVotePresent([])).toBe(false);
  expect(isVotePresent(['yes'])).toBe(true);
  expect(
    isVotePresent([
      election.contests.find(
        (c): c is CandidateContest => c.type === 'candidate'
      )!.candidates[0],
    ])
  ).toBe(true);
});

test('validates votes by checking that contests are present in a given ballot style', () => {
  const ballotStyle = election.ballotStyles[0];

  const yesno = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  ) as YesNoContest;
  expect(() =>
    validateVotes({
      votes: {
        [yesno.id]: ['yes'],
      },
      ballotStyle,
      election,
    })
  ).not.toThrowError();
  expect(() =>
    validateVotes({ votes: { nope: ['yes'] }, ballotStyle, election })
  ).toThrowError(
    'found a vote with contest id "nope", but no such contest exists in ballot style 1'
  );
});

test('list locales in election definition', () => {
  expect(getElectionLocales(election)).toEqual(['en-US']);
  expect(getElectionLocales(election, 'zh-CN')).toEqual(['zh-CN']);
  expect(getElectionLocales({ ...election, _lang: { 'es-US': {} } })).toEqual([
    'en-US',
    'es-US',
  ]);
});

test('pulls translation keys from the top level object', () => {
  expect(
    withLocale(
      { ...election, _lang: { 'es-US': { title: 'Eleccion General' } } },
      'es-US'
    ).title
  ).toEqual('Eleccion General');
});

test('withLocale ignores undefined keys', () => {
  withLocale(
    {
      ...election,
      ballotStyles: election.ballotStyles.map((bs) => ({
        ...bs,
        partyId: undefined,
        _lang: { 'es-US': {} },
      })),
      _lang: { 'es-US': {} },
    },
    'es-US'
  );
});

test('withLocale ignores missing strings for the locale', () => {
  withLocale(
    {
      ...election,
      ballotStyles: election.ballotStyles.map((bs) => ({
        ...bs,
        partyId: undefined,
        _lang: {},
      })),
      _lang: { 'es-US': {} },
    },
    'es-US'
  );
});

test('pulls translation keys from nested objects', () => {
  expect(
    withLocale(
      {
        ...election,
        parties: [
          unsafeParse(PartySchema, {
            id: 'FED',
            name: 'Federalist',
            abbrev: 'FED',
            fullName: 'Federalist',
            _lang: { 'es-US': { name: 'Federalista' } },
          }),
        ],
        _lang: { 'es-US': {} },
      },
      'es-US'
    ).parties[0].name
  ).toEqual('Federalista');
});

test('treats locale identifier as case-insensitive', () => {
  expect(withLocale(election, 'es-US')).toEqual(withLocale(election, 'eS-Us'));
});

test('passes undefined values through', () => {
  expect(withLocale({ ...election, seal: undefined }, 'es-US')).toHaveProperty(
    'seal',
    undefined
  );
});

test('uses the defaults for anything without a translation', () => {
  expect(withLocale(election, 'en-US').title).toEqual(election.title);
  expect(withLocale(election, 'fr-FR').title).toEqual(election.title);
});

test('trying to vote in the top-level ms-either-neither contest fails', () => {
  expect(() => {
    vote(electionWithMsEitherNeither.contests, {
      '750000015-either-neither': ['yes'],
    });
  }).toThrowError();
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
  safeParseElection(electionMinimalExhaustive).unsafeUnwrap();

  expect(
    safeParseElection({
      ...electionMinimalExhaustive,
      adjudicationReasons: [],
    }).err()?.message
  ).toContain('adjudicationReasons');
});
