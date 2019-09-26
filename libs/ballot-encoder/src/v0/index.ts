import {
  Election,
  BallotStyle,
  Contests,
  VotesDict,
  CandidateContest,
  CandidateVote,
  getContests,
  Precinct,
  YesNoContest,
  Candidate,
} from '../election'
import BitWriter from '../bits/BitWriter'

function* join<T>(
  objects: T[],
  delimiter: string,
  builder: (object: T) => Iterable<string>
): Iterable<string> {
  for (let i = 0; i < objects.length; i += 1) {
    yield* builder(objects[i])

    const isLast = i === objects.length - 1

    if (!isLast) {
      yield delimiter
    }
  }
}

export function encodeBallotInto(
  writer: BitWriter,
  {
    election,
    ballotStyle,
    precinct,
    votes,
    ballotId,
  }: {
    election: Election
    ballotStyle: BallotStyle
    precinct: Precinct
    votes: VotesDict
    ballotId: string
  }
): void {
  const append = (...values: string[]): void =>
    values.forEach(value => writer.writeString(value, { includeLength: false }))

  append(ballotStyle.id, '.', precinct.id, '.')

  for (const chunk of encodeVotes(
    getContests({ ballotStyle, election }),
    votes
  )) {
    append(chunk)
  }

  append('.', ballotId)
}

function* encodeVotes(
  contests: Contests,
  votes: VotesDict
): IterableIterator<string> {
  yield* join(contests, '|', function* encodeContest(
    contest: YesNoContest | CandidateContest
  ) {
    const contestVote = votes[contest.id]

    if (contestVote) {
      if (contest.type === 'yesno') {
        yield contestVote === 'yes' ? '1' : '0'
      } else {
        const candidateIDs = contest.candidates.map(c => c.id)
        yield* join(
          contestVote as CandidateVote,
          ',',
          function* encodeCandidate(c: Candidate) {
            yield c.isWriteIn ? 'W' : `${candidateIDs.indexOf(c.id)}`
          }
        )
      }
    }
  })
}

export function encodeBallotAsString({
  election,
  ballotStyle,
  precinct,
  votes,
  ballotId,
}: {
  election: Election
  ballotStyle: BallotStyle
  precinct: Precinct
  votes: VotesDict
  ballotId: string
}): string {
  const writer = new BitWriter()
  encodeBallotInto(writer, { election, ballotStyle, precinct, votes, ballotId })
  return new TextDecoder().decode(writer.toUint8Array())
}

// export function decodeVotesFrom(election: Election, data: Uint8Array) {
//   const ballotString = String.fromCharCode(...Array.from(data))

//   const [
//     ballotStyleId,
//     precinctId,
//     allSelections,
//     serialNumber,
//   ] = ballotString.split('.')

//   // figure out the contests
//   const ballotStyle = election.ballotStyles.find(
//     (b: BallotStyle) => b.id === ballotStyleId
//   )

//   if (!ballotStyle) {
//     return
//   }

//   const contests: Contests = election.contests.filter(
//     c =>
//       ballotStyle.districts.includes(c.districtId) &&
//       ballotStyle.partyId === c.partyId
//   )

//   // prepare the CVR
//   let cvr: CastVoteRecord = {}

//   const allSelectionsList = allSelections.split('|')
//   contests.forEach((contest: Contest, contestNum: number) => {
//     // no answer for a particular contest is recorded in our final dictionary as an empty string
//     // not the same thing as undefined.

//     if (contest.type === 'yesno') {
//       cvr[contest.id] = yesNoValues[allSelectionsList[contestNum]] || ''
//     } else {
//       if (contest.type === 'candidate') {
//         // selections for this question
//         const selections = allSelectionsList[contestNum].split(',')
//         if (selections.length > 1 || selections[0] !== '') {
//           cvr[contest.id] = selections.map(selection =>
//             selection === 'W'
//               ? 'writein'
//               : (contest as CandidateContest).candidates[parseInt(selection)].id
//           )
//         } else {
//           cvr[contest.id] = ''
//         }
//       }
//     }
//   })

//   cvr['_precinctId'] = precinctId
//   cvr['_serialNumber'] = serialNumber

//   return cvr
// }
