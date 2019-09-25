import { encodeBallotAsString } from './index'
import { Election, VotesDict, getContests, CandidateContest } from '../election'
import electionSample from '../data/electionSample.json'

test('encodes empty votes', () => {
  // TODO: is this a sane subset of election data?
  const election = electionSample as Election
  const ballotStyle = election.ballotStyles[0]
  const precinct = election.precincts[0]
  const votes: VotesDict = {}
  const ballotId = 'abcde'

  expect(
    encodeBallotAsString({
      election,
      ballotId,
      ballotStyle,
      precinct,
      votes,
    })
  ).toEqual('12.23.|||||||||||||||||||.abcde')
})

test('encodes yesno votes', () => {
  // TODO: is this a sane subset of election data?
  const election = electionSample as Election
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const yesnos = contests.filter(contest => contest.type === 'yesno')!
  const votes: VotesDict = {
    [yesnos[0].id]: 'yes',
    [yesnos[1].id]: 'no',
  }
  const ballotId = 'abcde'

  expect(
    encodeBallotAsString({
      election,
      ballotId,
      ballotStyle,
      precinct,
      votes,
    })
  ).toEqual('12.23.||||||||||||1|0||||||.abcde')
})

test('encodes candidate votes', () => {
  // TODO: is this a sane subset of election data?
  const election = electionSample as Election
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const contest = contests.find(c => c.type === 'candidate') as CandidateContest
  const votes: VotesDict = {
    [contest.id]: contest.candidates.slice(0, 2),
  }
  const ballotId = 'abcde'

  expect(
    encodeBallotAsString({
      election,
      ballotId,
      ballotStyle,
      precinct,
      votes,
    })
  ).toEqual('12.23.0,1|||||||||||||||||||.abcde')
})

test('encodes write-ins as `W`', () => {
  // TODO: is this a sane subset of election data?
  const election = electionSample as Election
  const ballotStyle = election.ballotStyles[0]
  const contests = getContests({ ballotStyle, election })
  const precinct = election.precincts[0]
  const contest = contests.find(c => c.type === 'candidate') as CandidateContest
  const votes: VotesDict = {
    [contest.id]: [
      { name: 'MICKEY MOUSE', isWriteIn: true, id: 'write-in__MICKEY MOUSE' },
    ],
  }
  const ballotId = 'abcde'

  expect(
    encodeBallotAsString({
      election,
      ballotId,
      ballotStyle,
      precinct,
      votes,
    })
  ).toEqual('12.23.W|||||||||||||||||||.abcde')
})
