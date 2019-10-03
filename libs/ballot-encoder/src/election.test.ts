import {
  vote,
  getPartyPrimaryAdjectiveFromBallotStyle,
  electionSample as election,
  validateVotes,
  CandidateContest,
} from './election'

test('can build votes from a candidate ID', () => {
  const contests = election.contests.filter(c => c.id === 'president')
  const president = contests[0] as CandidateContest
  const candidateId = 'barchi-hallaren'

  expect(vote(contests, { president: candidateId })).toEqual({
    president: [president.candidates.find(c => candidateId === c.id)],
  })
})

test('can build votes from an array of candidate IDs', () => {
  const contests = election.contests.filter(c => c.id === 'president')
  const president = contests[0] as CandidateContest
  const candidateIds = ['barchi-hallaren', 'cramer-vuocolo']

  expect(vote(contests, { president: candidateIds })).toEqual({
    president: president.candidates.filter(c => candidateIds.includes(c.id)),
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

test('can build votes from a candidate object', () => {
  const contests = election.contests.filter(c => c.id === 'president')
  const president = contests[0] as CandidateContest
  const candidate = president.candidates[0]

  expect(vote(contests, { president: candidate })).toEqual({
    president: [candidate],
  })
})

test('can build votes from a candidates array', () => {
  const contests = election.contests.filter(c => c.id === 'president')
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

test('special cases party primary adjective transform "Democrat" -> "Democratic"', () => {
  const ballotStyleId = '12D'
  expect(
    getPartyPrimaryAdjectiveFromBallotStyle({
      ballotStyleId,
      election: {
        ...election,
        parties: [{ id: '0', abbrev: 'D', name: 'Democrat' }],
      },
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
    validateVotes({ votes: { nope: 'yes' }, ballotStyle, election })
  ).toThrowError(
    'found a vote with contest id "nope", but no such contest exists in ballot style 12'
  )
})
