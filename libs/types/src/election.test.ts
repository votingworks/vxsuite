import * as fc from 'fast-check';
import { sha256 } from 'js-sha256';
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
  electionMinimalExhaustive,
  electionPrimaryNonpartisanContests,
  primaryElection,
} from '../test/election';
import {
  CandidateContest,
  CandidateSchema,
  ElectionDefinitionSchema,
  electionHasPrimaryBallotStyle,
  electionHasPrimaryContest,
  getBallotStyle,
  getCandidateParties,
  getCandidatePartiesDescription,
  getContests,
  getContestDistrictName,
  getContestsFromIds,
  getElectionLocales,
  getPartyAbbreviationByPartyId,
  getPartyFullNameFromBallotStyle,
  getPartyIdsWithContests,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPartySpecificElectionTitle,
  getPrecinctById,
  getPrecinctIndexById,
  isVotePresent,
  PartyId,
  PartyIdSchema,
  PartySchema,
  validateVotes,
  vote,
  withLocale,
  YesNoContest,
  getDisplayElectionHash,
  safeParseElectionDefinition,
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
      ).toEqual(true);
    }
  }
});

test('getPartyIdsInBallotStyles', () => {
  expect(getPartyIdsInBallotStyles(electionMinimalExhaustive)).toEqual(
    electionMinimalExhaustive.parties.map(({ id }) => id)
  );
});

test('getContests', () => {
  // general election ballot
  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '1',
        election,
      })!,
      election,
    }).map((c) => c.id)
  ).toMatchObject(['CC', 'YNC']);

  // primary ballots without non-partisan races
  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '1M',
        election: electionMinimalExhaustive,
      })!,
      election: electionMinimalExhaustive,
    }).map((c) => c.id)
  ).toMatchObject([
    'best-animal-mammal',
    'zoo-council-mammal',
    'new-zoo-either-neither',
  ]);

  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '2F',
        election: electionMinimalExhaustive,
      })!,
      election: electionMinimalExhaustive,
    }).map((c) => c.id)
  ).toMatchObject(['best-animal-fish', 'aquarium-council-fish', 'fishing']);

  // primary ballots with non-partisan races
  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '1M',
        election: electionPrimaryNonpartisanContests,
      })!,
      election: electionPrimaryNonpartisanContests,
    }).map((c) => c.id)
  ).toMatchObject([
    'best-animal-mammal',
    'zoo-council-mammal',
    'new-zoo-either-neither',
    'kingdom',
  ]);

  expect(
    getContests({
      ballotStyle: getBallotStyle({
        ballotStyleId: '2F',
        election: electionPrimaryNonpartisanContests,
      })!,
      election: electionPrimaryNonpartisanContests,
    }).map((c) => c.id)
  ).toMatchObject([
    'best-animal-fish',
    'aquarium-council-fish',
    'fishing',
    'kingdom',
  ]);
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

test('electionHasPrimaryBallotStyle', () => {
  expect(electionHasPrimaryBallotStyle(electionMinimalExhaustive)).toEqual(
    true
  );
  expect(electionHasPrimaryBallotStyle(election)).toEqual(false);
});

test('electionHasPrimaryContest', () => {
  expect(electionHasPrimaryContest(electionMinimalExhaustive)).toEqual(true);
  expect(electionHasPrimaryContest(election)).toEqual(false);
});

test('getPartyIdsWithContests', () => {
  expect(getPartyIdsWithContests(election)).toMatchObject([undefined]);
  expect(getPartyIdsWithContests(electionMinimalExhaustive)).toMatchObject([
    '0',
    '1',
  ]);
  expect(
    getPartyIdsWithContests(electionPrimaryNonpartisanContests)
  ).toMatchObject(['0', '1', undefined]);
});

test('getPartySpecificElectionTitle', () => {
  expect(getPartySpecificElectionTitle(election, undefined)).toEqual(
    'ELECTION'
  );
  expect(
    getPartySpecificElectionTitle(
      electionPrimaryNonpartisanContests,
      '0' as PartyId
    )
  ).toEqual('Mammal Party Example Primary Election');
  expect(
    getPartySpecificElectionTitle(electionPrimaryNonpartisanContests, undefined)
  ).toEqual('Example Primary Election Nonpartisan Contests');
});

test('getContestDistrictName', () => {
  expect(
    getContestDistrictName(
      electionMinimalExhaustive,
      electionMinimalExhaustive.contests[0]
    )
  ).toEqual('District 1');
});

test('isVotePresent', () => {
  expect(isVotePresent()).toEqual(false);
  expect(isVotePresent([])).toEqual(false);
  expect(isVotePresent(['yes'])).toEqual(true);
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
  safeParseElection(electionMinimalExhaustive).unsafeUnwrap();

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

test('election scheme results reporting URL', () => {
  expect(() => {
    safeParseElection({
      ...election,
      quickResultsReportingUrl: 'https://results.voting.works/',
    }).unsafeUnwrap();
  }).toThrowError();

  expect(() => {
    safeParseElection({
      ...election,
      quickResultsReportingUrl: 'https://results.voting.works',
    }).unsafeUnwrap();
  }).not.toThrowError();
});

test('loading an election with the old sealURL field', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sealUrl, ...rest } = election;

  expect(
    safeParseElection({
      ...rest,
      // eslint-disable-next-line vx/gts-identifiers
      sealURL: 'https://example.com/seal.png',
    }).unsafeUnwrap().sealUrl
  ).toEqual('https://example.com/seal.png');
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
  ).toEqual('');

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
      electionHash: 'abc',
      electionData,
      election: electionMinimalExhaustive,
    });
  }).toThrowError(/hash/);

  expect(
    unsafeParse(ElectionDefinitionSchema, {
      electionHash: sha256(electionData),
      electionData,
      election,
    }).election
  ).toEqual(election);
});

test('getDisplayElectionHash', () => {
  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify(election)
  ).ok();
  expect(getDisplayElectionHash(electionDefinition!)).toEqual('7dcbb8f101');
});
