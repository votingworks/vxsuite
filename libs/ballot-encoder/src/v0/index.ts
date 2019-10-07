/**
 * v0 ballot encoding format. See README.md in this directory for more information.
 */

import {
  BallotType,
  Candidate,
  CandidateContest,
  CandidateVote,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
  Vote,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '../election'

export const MAXIMUM_WRITE_IN_LENGTH = 40

const BallotSections = [
  'ballot style id',
  'precinct id',
  'encoded votes',
  'ballot id',
]
const BallotSectionSeparator = '.'
const VoteSeparator = '|'
const CandidateSeparator = ','
const EmptyVoteValue = ''

/**
 * Detects whether `data` is a v0-encoded ballot.
 */
export function detect(data: Uint8Array): boolean {
  try {
    return (
      new TextDecoder().decode(data).split(BallotSectionSeparator).length ===
      BallotSections.length
    )
  } catch {
    return false
  }
}

/**
 * Detects whether `data` is a v0-encoded ballot.
 */
export function detectString(data: string): boolean {
  return data.split(BallotSectionSeparator).length === BallotSections.length
}

/**
 * Encodes a ballot for transport or storage.
 */
export function encodeBallot(ballot: CompletedBallot): Uint8Array {
  return new TextEncoder().encode(encodeBallotAsString(ballot))
}

/**
 * Convenience function for encoding ballot data as a string, for testing.
 */
export function encodeBallotAsString({
  election,
  ballotStyle,
  precinct,
  votes,
  ballotId,
}: CompletedBallot): string {
  const contests = getContests({ ballotStyle, election })

  return [
    ballotStyle.id,
    precinct.id,
    encodeBallotVotes(contests, votes),
    ballotId,
  ].join(BallotSectionSeparator)
}

function encodeBallotVotes(contests: Contests, votes: VotesDict): string {
  return contests
    .map(contest => {
      const contestVote = votes[contest.id]
      if (!contestVote) {
        return EmptyVoteValue
      }

      if (contest.type === 'yesno') {
        return encodeYesNoVote(contest, contestVote as YesNoVote)
      }

      return encodeCandidateVote(contest, contestVote as CandidateVote)
    })
    .join(VoteSeparator)
}

function encodeYesNoVote(
  _contest: YesNoContest,
  contestVote: YesNoVote
): string {
  switch (contestVote) {
    case 'no':
      return '0'
    case 'yes':
      return '1'
    default:
      throw new Error(
        `cannot encode yesno vote, expected "no" or "yes" but got ${JSON.stringify(
          contestVote
        )}`
      )
  }
}

function encodeCandidateVote(
  contest: CandidateContest,
  contestVote: CandidateVote
): string {
  const candidateIDs = contest.candidates.map(c => c.id)
  return (contestVote as CandidateVote)
    .map(c => (c.isWriteIn ? 'W' : candidateIDs.indexOf(c.id)))
    .join(CandidateSeparator)
}

export function decodeBallot(
  election: Election,
  data: Uint8Array
): CompletedBallot {
  return decodeBallotFromString(election, new TextDecoder().decode(data))
}

/**
 * Convenience function for decoding ballot data from a string, for testing.
 */
export function decodeBallotFromString(
  election: Election,
  encodedBallot: string
): CompletedBallot {
  const encodedBallotSections = encodedBallot.split(BallotSectionSeparator)

  if (encodedBallotSections.length !== BallotSections.length) {
    throw new Error(
      `ballot data is malformed, expected data in this format: ${BallotSections.map(
        section => `«${section}»`
      ).join(BallotSectionSeparator)}`
    )
  }
  const [
    ballotStyleId,
    precinctId,
    encodedVotes,
    ballotId,
  ] = encodedBallot.split(BallotSectionSeparator)

  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const precinct = getPrecinctById({ precinctId, election })

  if (!ballotStyle) {
    throw new Error(`unable to find ballot style by id: ${ballotStyleId}`)
  }

  if (!precinct) {
    throw new Error(`unable to find precinct by id: ${precinctId}`)
  }

  const votes = decodeBallotVotes(
    getContests({ ballotStyle, election }),
    encodedVotes
  )

  return {
    ballotId,
    ballotStyle,
    election,
    precinct,
    votes,
    isTestBallot: false,
    ballotType: BallotType.Standard,
  }
}

function decodeBallotVotes(
  contests: Contests,
  encodedVotes: string
): VotesDict {
  const encodedVoteList = encodedVotes.split(VoteSeparator)

  if (contests.length !== encodedVoteList.length) {
    throw new Error(
      `found ${encodedVoteList.length} vote(s), but expected ${contests.length} (one per contest)`
    )
  }

  return encodedVoteList.reduce((dict, encodedVote, contestIndex) => {
    if (encodedVote === EmptyVoteValue) {
      return dict
    }

    const contest = contests[contestIndex]
    let contestVote: Vote

    if (contest.type === 'yesno') {
      contestVote = decodeYesNoVote(contest, encodedVote)
    } else {
      contestVote = decodeCandidateVote(contest, encodedVote)
    }

    return { ...dict, [contest.id]: contestVote }
  }, {})
}

function decodeYesNoVote(
  contest: YesNoContest,
  contestVote: string
): YesNoVote {
  switch (contestVote) {
    case '0':
      return 'no'
    case '1':
      return 'yes'
    default:
      throw new Error(
        `cannot decode yesno vote in contest ${JSON.stringify(
          contest.id
        )}, expected "0" or "1" but got ${JSON.stringify(contestVote)}`
      )
  }
}

function decodeCandidateVote(
  contest: CandidateContest,
  contestVote: string
): CandidateVote {
  const { candidates } = contest

  return contestVote.split(CandidateSeparator).map(
    (encodedCandidateVote): Candidate => {
      if (encodedCandidateVote === 'W') {
        return { isWriteIn: true, id: 'write-in__NOT RECORDED', name: '' }
      }

      const index = Number(encodedCandidateVote)

      if (isNaN(index) || index < 0 || index >= candidates.length) {
        throw new Error(
          `expected candidate index in contest ${JSON.stringify(
            contest.id
          )} to be in range [0, ${candidates.length}) but got ${JSON.stringify(
            encodedCandidateVote
          )}`
        )
      }

      return candidates[index]
    }
  )
}
