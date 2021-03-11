import {
  election,
  electionWithMsEitherNeither,
  primaryElection,
} from '../test/election'
import {
  CandidateContest,
  getEitherNeitherContests,
  getElectionLocales,
  getPartyFullNameFromBallotStyle,
  getPartyPrimaryAdjectiveFromBallotStyle,
  getPrecinctById,
  isVotePresent,
  parseElection,
  Party,
  validateVotes,
  vote,
  withLocale,
  YesNoContest,
} from './election'

test('can build votes from a candidate ID', () => {
  const contests = election.contests.filter((c) => c.id === 'CC')
  const contest = contests[0] as CandidateContest

  expect(vote(contests, { CC: 'C' })).toEqual({
    CC: [contest.candidates[0]],
  })
})

test('can build votes from an array of candidate IDs', () => {
  const contests = election.contests.filter((c) => c.id === 'CC')
  const contest = contests[0] as CandidateContest

  expect(
    vote(contests, { [contest.id]: contest.candidates.map((c) => c.id) })
  ).toEqual({
    [contest.id]: contest.candidates,
  })
})

test('can build votes from yesno values', () => {
  expect(vote(election.contests, { YNC: 'yes' })).toEqual({
    YNC: 'yes',
  })
  expect(vote(election.contests, { YNC: 'no' })).toEqual({
    YNC: 'no',
  })
})

test('can build votes from ms-either-neither yesno values', () => {
  expect(
    vote(electionWithMsEitherNeither.contests, {
      MSEN: 'yes',
      MSPO: 'no',
    })
  ).toEqual({
    MSEN: 'yes',
    MSPO: 'no',
  })
})

test('can build votes from a candidate object', () => {
  const contests = election.contests.filter((c) => c.id === 'CC')
  const contest = contests[0] as CandidateContest
  const candidate = contest.candidates[0]

  expect(vote(contests, { CC: candidate })).toEqual({
    CC: [candidate],
  })
})

test('can get ms-either-neither contests from a list', () => {
  expect(
    getEitherNeitherContests(electionWithMsEitherNeither.contests)
  ).toHaveLength(1)
})

test('can build votes from a candidates array', () => {
  const contests = election.contests.filter((c) => c.id === 'CC')
  const contest = contests[0] as CandidateContest
  const { candidates } = contest

  expect(vote(contests, { CC: candidates })).toEqual({
    CC: candidates,
  })
})

test('vote throws when given a contest id that does not match a contest', () => {
  expect(() => vote([], { nope: 'yes' })).toThrowError('unknown contest nope')
})

test('can get a party primary adjective from ballot style', () => {
  const ballotStyleId = '1D'
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic')
})

test('can get a party full name from ballot style', () => {
  const ballotStyleId = '1D'
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic Party')
})

test('can get a party full name from ballot style', () => {
  const ballotStyleId = 'DOES_NOT_EXIST'
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('')
})

test('special cases party primary adjective transform "Democrat" -> "Democratic"', () => {
  const ballotStyleId = '1D'
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: primaryElection,
    })
  ).toEqual('Democratic')
})

test('defaults to empty string if no party can be found', () => {
  const ballotStyleId = '12Z'
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: {
        ...election,
        parties: [],
      },
    })
  ).toEqual('')
})

test('getPrecinctById', () => {
  expect(
    getPrecinctById({ election, precinctId: election.precincts[0].id })
  ).toBe(election.precincts[0])
  expect(getPrecinctById({ election, precinctId: '' })).toBeUndefined()
})

test('isVotePresent', () => {
  expect(isVotePresent()).toBe(false)
  expect(isVotePresent([])).toBe(false)
  expect(isVotePresent(['yes'])).toBe(true)
  expect(
    isVotePresent([
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      election.contests.find(
        (c): c is CandidateContest => c.type === 'candidate'
      )!.candidates[0],
    ])
  ).toBe(true)
})

test('validates votes by checking that contests are present in a given ballot style', () => {
  const ballotStyle = election.ballotStyles[0]

  const yesno = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  ) as YesNoContest
  expect(() =>
    validateVotes({
      votes: {
        [yesno.id]: ['yes'],
      },
      ballotStyle,
      election,
    })
  ).not.toThrowError()
  expect(() =>
    validateVotes({ votes: { nope: ['yes'] }, ballotStyle, election })
  ).toThrowError(
    'found a vote with contest id "nope", but no such contest exists in ballot style 1'
  )
})

test('list locales in election definition', () => {
  expect(getElectionLocales(election)).toEqual(['en-US'])
  expect(getElectionLocales(election, 'zh-CN')).toEqual(['zh-CN'])
  expect(getElectionLocales({ ...election, _lang: { 'es-US': {} } })).toEqual([
    'en-US',
    'es-US',
  ])
})

test('pulls translation keys from the top level object', () => {
  expect(
    withLocale(
      { ...election, _lang: { 'es-US': { title: 'Eleccion General' } } },
      'es-US'
    ).title
  ).toEqual('Eleccion General')
})

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
  )
})

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
  )
})

test('pulls translation keys from nested objects', () => {
  expect(
    withLocale(
      {
        ...election,
        parties: [
          {
            id: 'FED',
            name: 'Federalist',
            abbrev: 'FED',
            fullName: 'Federalist',
            _lang: { 'es-US': { name: 'Federalista' } },
          } as Party,
        ],
        _lang: { 'es-US': {} },
      },
      'es-US'
    ).parties[0].name
  ).toEqual('Federalista')
})

test('treats locale identifier as case-insensitive', () => {
  expect(withLocale(election, 'es-US')).toEqual(withLocale(election, 'eS-Us'))
})

test('passes undefined values through', () => {
  expect(withLocale({ ...election, seal: undefined }, 'es-US')).toHaveProperty(
    'seal',
    undefined
  )
})

test('uses the defaults for anything without a translation', () => {
  expect(withLocale(election, 'en-US').title).toEqual(election.title)
  expect(withLocale(election, 'fr-FR').title).toEqual(election.title)
})

test('parsing fails on an empty object', () => {
  expect(() => parseElection({})).toThrowError(
    'title: Non-string type: undefined'
  )
})

test('parsing gives specific errors for nested objects', () => {
  expect(() =>
    parseElection({
      ...election,
      contests: [
        ...election.contests.slice(1),
        {
          ...election.contests[0],
          // give title a type it shouldn't have
          title: 42,
        },
      ],
    })
  ).toThrowError(/contests.1:.*title: Non-string type: number/s)
})

test('ensures dates are ISO 8601-formatted', () => {
  expect(() =>
    parseElection({
      ...election,
      date: 'not ISO',
    })
  ).toThrowError('dates must be ISO 8601-formatted')
})

test('parsing a valid election object succeeds', () => {
  expect(() => {
    const parsed = parseElection(election as unknown)

    // This check is here to prove TS inferred that `parsed` is an `Election`.
    expect(parsed.title).toEqual(election.title)

    // Check the whole thing
    expect(parsed).toEqual(election)
  }).not.toThrowError()
})

test('parsing a valid election with ms-either-neither succeeds', () => {
  expect(() => {
    const parsed = parseElection(electionWithMsEitherNeither as unknown)

    // This check is here to prove TS inferred that `parsed` is an `Election`.
    expect(parsed.title).toEqual(electionWithMsEitherNeither.title)

    // Check the whole thing
    expect(parsed).toEqual(electionWithMsEitherNeither)
  }).not.toThrowError()
})

test('trying to vote in the top-level ms-either-neither contest fails', () => {
  expect(() => {
    vote(electionWithMsEitherNeither.contests, {
      '750000015-either-neither': ['yes'],
    })
  }).toThrowError()
})

test('parsing validates district references', () => {
  expect(() => {
    parseElection({
      ...election,
      districts: [{ id: 'DIS', name: 'DIS' }],
    })
  }).toThrowError(
    "Ballot style '1' has district 'D', but no such district is defined. Districts defined: [DIS]"
  )
})

test('parsing validates precinct references', () => {
  expect(() => {
    parseElection({
      ...election,
      precincts: [{ id: 'PRE', name: 'PRE' }],
    })
  }).toThrowError(
    "Ballot style '1' has precinct 'P', but no such precinct is defined. Precincts defined: [PRE]"
  )
})

test('parsing validates contest party references', () => {
  const contest = election.contests.find(
    ({ id }) => id === 'CC'
  ) as CandidateContest
  const remainingContests = election.contests.filter((c) => contest !== c)

  expect(() => {
    parseElection({
      ...election,
      contests: [
        {
          ...contest,
          partyId: 'not-a-party',
        },
        ...remainingContests,
      ],
    })
  }).toThrowError(
    "Contest 'CC' has party 'not-a-party', but no such party is defined. Parties defined: [PARTY]"
  )
})

test('parsing validates candidate party references', () => {
  const contest = election.contests.find(
    ({ id }) => id === 'CC'
  ) as CandidateContest
  const remainingContests = election.contests.filter((c) => contest !== c)

  expect(() => {
    parseElection({
      ...election,
      contests: [
        {
          ...contest,
          candidates: [
            ...contest.candidates.slice(1),
            {
              ...contest.candidates[0],
              partyId: 'not-a-party',
            },
          ],
        },
        ...remainingContests,
      ],
    })
  }).toThrowError(
    "Candidate 'C' in contest 'CC' has party 'not-a-party', but no such party is defined. Parties defined: [PARTY]"
  )
})

test('validates uniqueness of district ids', () => {
  expect(() => {
    parseElection({
      ...election,
      districts: [...election.districts, ...election.districts],
    })
  }).toThrowError("Duplicate district 'D' found.")
})

test('validates uniqueness of precinct ids', () => {
  expect(() => {
    parseElection({
      ...election,
      precincts: [...election.precincts, ...election.precincts],
    })
  }).toThrowError("Duplicate precinct 'P' found.")
})

test('validates uniqueness of contest ids', () => {
  expect(() => {
    parseElection({
      ...election,
      contests: [...election.contests, ...election.contests],
    })
  }).toThrowError("Duplicate contest 'CC' found.")
})

test('validates uniqueness of party ids', () => {
  expect(() => {
    parseElection({
      ...election,
      parties: [...election.parties, ...election.parties],
    })
  }).toThrowError("Duplicate party 'PARTY' found.")
})

test('validates uniqueness of candidate ids within a contest', () => {
  const contest = election.contests[0] as CandidateContest

  expect(() => {
    parseElection({
      ...election,
      contests: [
        ...election.contests.slice(1),
        {
          ...contest,
          candidates: [...contest.candidates, ...contest.candidates],
        },
      ],
    })
  }).toThrowError("Duplicate candidate 'C' found in contest 'CC'.")
})
