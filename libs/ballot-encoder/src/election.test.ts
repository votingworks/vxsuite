import {
  CandidateContest,
  Election,
  electionSample as election,
  getElectionLocales,
  getPartyFullNameFromBallotStyle,
  getPartyPrimaryAdjectiveFromBallotStyle,
  parseElection,
  validateVotes,
  vote,
  withLocale,
} from './election'

import electionWithMsEitherOrUntyped from './data/electionWithMsEitherOr.json'
const electionWithMsEitherOr = (electionWithMsEitherOrUntyped as unknown) as Election

test('can build votes from a candidate ID', () => {
  const contests = election.contests.filter((c) => c.id === 'president')
  const president = contests[0] as CandidateContest
  const candidateId = 'barchi-hallaren'

  expect(vote(contests, { president: candidateId })).toEqual({
    president: [president.candidates.find((c) => candidateId === c.id)],
  })
})

test('can build votes from an array of candidate IDs', () => {
  const contests = election.contests.filter((c) => c.id === 'president')
  const president = contests[0] as CandidateContest
  const candidateIds = ['barchi-hallaren', 'cramer-vuocolo']

  expect(vote(contests, { president: candidateIds })).toEqual({
    president: president.candidates.filter((c) => candidateIds.includes(c.id)),
  })
})

test('can build votes from yesno values', () => {
  expect(
    vote(election.contests, { 'question-a': 'yes', 'question-b': 'no' })
  ).toEqual({
    'question-a': 'yes',
    'question-b': 'no',
  })
})

test('can build votes from ms-either-or yesno values', () => {
  expect(
    vote(electionWithMsEitherOr.contests, {
      '750000015': 'yes',
      '750000016': 'no',
    })
  ).toEqual({
    '750000015': 'yes',
    '750000016': 'no',
  })
})

test('can build votes from a candidate object', () => {
  const contests = election.contests.filter((c) => c.id === 'president')
  const president = contests[0] as CandidateContest
  const candidate = president.candidates[0]

  expect(vote(contests, { president: candidate })).toEqual({
    president: [candidate],
  })
})

test('can build votes from a candidates array', () => {
  const contests = election.contests.filter((c) => c.id === 'president')
  const president = contests[0] as CandidateContest
  const { candidates } = president

  expect(vote(contests, { president: candidates })).toEqual({
    president: candidates,
  })
})

test('vote throws when given a contest id that does not match a contest', () => {
  expect(() => vote([], { nope: 'yes' })).toThrowError('unknown contest nope')
})

test('can get a party primary adjective from ballot style', () => {
  const ballotStyleId = '12F'
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election,
    })
  ).toEqual('Federalist')
})

test('can get a party full name from ballot style', () => {
  const ballotStyleId = '7C'
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election,
    })
  ).toEqual('Constitution Party')
})

test('can get a party full name from ballot style', () => {
  const ballotStyleId = 'DOES_NOT_EXIST'
  expect(
    getPartyFullNameFromBallotStyle({
      ballotStyleId,
      election,
    })
  ).toEqual('')
})

test('special cases party primary adjective transform "Democrat" -> "Democratic"', () => {
  const ballotStyleId = '12D'
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election,
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

test('validates votes by checking that contests are present in a given ballot style', () => {
  const ballotStyle = election.ballotStyles[0]

  expect(() =>
    validateVotes({ votes: { nope: ['yes'] }, ballotStyle, election })
  ).toThrowError(
    'found a vote with contest id "nope", but no such contest exists in ballot style 12'
  )
})

test('list locales in election definition', () => {
  expect(getElectionLocales(election)).toEqual(['en-US', 'es-US'])
  expect(getElectionLocales(election, 'zh-CN')).toEqual(['zh-CN', 'es-US'])
  expect(getElectionLocales({ ...election, _lang: undefined })).toEqual([
    'en-US',
  ])
})

test('pulls translation keys from the top level object', () => {
  expect(election.title).toEqual('General Election')
  expect(withLocale(election, 'es-US').title).toEqual('Eleccion General')
})

test('pulls translation keys from nested objects', () => {
  expect(election.parties[0].name).toEqual('Federalist')
  expect(withLocale(election, 'es-US').parties[0].name).toEqual('Federalista')
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
  ).toThrowError(/contests.21:.*title: Non-string type: number/s)
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

test('parsing a valid election with ms either-or succeeds', () => {
  expect(() => {
    const parsed = parseElection(electionWithMsEitherOr as unknown)

    // This check is here to prove TS inferred that `parsed` is an `Election`.
    expect(parsed.title).toEqual(electionWithMsEitherOr.title)

    // Check the whole thing
    expect(parsed).toEqual(electionWithMsEitherOr)
  }).not.toThrowError()
})

test('parsing validates district references', () => {
  expect(() => {
    parseElection({
      ...election,
      districts: election.districts.filter(({ id }) => id !== 'district-1'),
    })
  }).toThrowError(
    "Ballot style '12' has district 'district-1', but no such district is defined. Districts defined: [district-2, district-3, 7]"
  )
})

test('parsing validates precinct references', () => {
  expect(() => {
    parseElection({
      ...election,
      precincts: election.precincts.filter(({ id }) => id !== '23'),
    })
  }).toThrowError(
    "Ballot style '12' has precinct '23', but no such precinct is defined. Precincts defined: [21, 20]"
  )
})

test('parsing validates contest party references', () => {
  const contest = election.contests.find(
    ({ id }) => id === 'president'
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
    "Contest 'president' has party 'not-a-party', but no such party is defined. Parties defined: [0, 1, 2, 3, 4, 5, 6, 7, 8]"
  )
})

test('parsing validates candidate party references', () => {
  const contest = election.contests.find(
    ({ id }) => id === 'president'
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
    "Candidate 'barchi-hallaren' in contest 'president' has party 'not-a-party', but no such party is defined. Parties defined: [0, 1, 2, 3, 4, 5, 6, 7, 8]"
  )
})

test('validates uniqueness of district ids', () => {
  expect(() => {
    parseElection({
      ...election,
      districts: [...election.districts, ...election.districts],
    })
  }).toThrowError("Duplicate district 'district-1' found.")
})

test('validates uniqueness of precinct ids', () => {
  expect(() => {
    parseElection({
      ...election,
      precincts: [...election.precincts, ...election.precincts],
    })
  }).toThrowError("Duplicate precinct '23' found.")
})

test('validates uniqueness of contest ids', () => {
  expect(() => {
    parseElection({
      ...election,
      contests: [...election.contests, ...election.contests],
    })
  }).toThrowError("Duplicate contest 'president' found.")
})

test('validates uniqueness of party ids', () => {
  expect(() => {
    parseElection({
      ...election,
      parties: [...election.parties, ...election.parties],
    })
  }).toThrowError("Duplicate party '0' found.")
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
  }).toThrowError(
    "Duplicate candidate 'barchi-hallaren' found in contest 'president'."
  )
})
