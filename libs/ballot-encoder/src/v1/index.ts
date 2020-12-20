import {
  BitReader,
  BitWriter,
  CustomEncoding,
  toUint8,
  Uint8,
  Uint8Size,
} from '../bits'
import {
  AnyContest,
  BallotLocale,
  BallotStyle,
  BallotType,
  BallotTypeMaximumValue,
  Candidate,
  CandidateVote,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
  isVotePresent,
  Optional,
  Precinct,
  validateVotes,
  VotesDict,
  YesNoVote,
} from '../election'

console.log('aaasa889')
export const MAXIMUM_WRITE_IN_LENGTH = 40
export const MAXIMUM_PAGE_NUMBERS = 30

// pad this locale array so the same code can later be upgraded
// to support other languages without breaking previously printed ballots
export const SUPPORTED_LOCALES = ['en-US', 'es-US'].concat(new Array(250))

// TODO: include "magic number" and encoding version

export const WriteInEncoding = new CustomEncoding(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ \'"-.,'
)

export const HexEncoding = new CustomEncoding('0123456789abcdef')

export const Prelude: readonly Uint8[] = [
  /* V */ 86,
  /* X */ 88,
  /* version = */ 1,
]

export const HMPBPrelude: readonly Uint8[] = [
  /* V */ 86,
  /* P = Paper */ 80,
  /* version = */ 1,
]

/**
 * Detects whether `data` is a v1-encoded ballot.
 */
export function detect(data: Uint8Array): boolean {
  const prelude = data.slice(0, Prelude.length)

  return (
    prelude.length === Prelude.length &&
    prelude.every((byte, i) => byte === Prelude[i])
  )
}

export function encodeBallot(
  election: Election,
  ballot: CompletedBallot
): Uint8Array {
  const bits = new BitWriter()
  encodeBallotInto(election, ballot, bits)
  console.log('encoded', bits.toUint8Array())
  return bits.toUint8Array()
}

export function encodeBallotInto(
  election: Election,
  {
    ballotStyle,
    precinct,
    votes,
    ballotId,
    isTestMode,
    ballotType,
  }: CompletedBallot,
  bits: BitWriter
): BitWriter {
  validateVotes({ election, ballotStyle, votes })

  const contests = getContests({ ballotStyle, election })

  return bits
    .writeUint8(...Prelude)
    .writeString(ballotStyle.id)
    .writeString(precinct.id)
    .writeString(ballotId)
    .with(() => encodeBallotVotesInto(contests, votes, bits))
    .writeBoolean(isTestMode)
    .writeUint(ballotType, { max: BallotTypeMaximumValue })
}

function writeYesNoVote(bits: BitWriter, ynVote: YesNoVote): void {
  if (!Array.isArray(ynVote)) {
    throw new Error(
      `cannot encode a non-array yes/no vote: ${JSON.stringify(ynVote)}`
    )
  }

  if (ynVote.length > 1) {
    throw new Error(
      `cannot encode a yes/no overvote: ${JSON.stringify(ynVote)}`
    )
  }

  // yesno votes get a single bit
  bits.writeBoolean(ynVote[0] === 'yes')
}

function encodeBallotVotesInto(
  contests: Contests,
  votes: VotesDict,
  bits: BitWriter
): BitWriter {
  // write roll call
  for (const contest of contests) {
    if (contest.type === 'ms-either-neither') {
      bits.writeBoolean(isVotePresent(votes[contest.eitherNeitherContestId]))
      bits.writeBoolean(isVotePresent(votes[contest.pickOneContestId]))
    } else {
      bits.writeBoolean(isVotePresent(votes[contest.id]))
    }
  }

  // write vote data
  for (const contest of contests) {
    if (contest.type === 'ms-either-neither') {
      const eitherNeitherYnVote = votes[
        contest.eitherNeitherContestId
      ] as Optional<YesNoVote>
      const pickOneYnVote = votes[
        contest.pickOneContestId
      ] as Optional<YesNoVote>

      if (eitherNeitherYnVote) {
        writeYesNoVote(bits, eitherNeitherYnVote)
      }

      if (pickOneYnVote) {
        writeYesNoVote(bits, pickOneYnVote)
      }

      continue
    }

    const contestVote = votes[contest.id]

    if (isVotePresent(contestVote)) {
      if (contest.type === 'yesno') {
        const ynVote = contestVote as YesNoVote

        writeYesNoVote(bits, ynVote)
      } else {
        const choices = contestVote as CandidateVote

        // candidate choices get one bit per candidate
        for (const candidate of contest.candidates) {
          bits.writeBoolean(
            choices.some((choice) => choice.id === candidate.id)
          )
        }

        if (contest.allowWriteIns) {
          // write write-in data
          const writeInCount = choices.reduce(
            (count, choice) => count + (choice.isWriteIn ? 1 : 0),
            0
          )
          const nonWriteInCount = choices.length - writeInCount
          const maximumWriteIns = Math.max(0, contest.seats - nonWriteInCount)

          if (maximumWriteIns > 0) {
            bits.writeUint(writeInCount, { max: maximumWriteIns })

            for (const choice of choices) {
              if (choice.isWriteIn) {
                bits.writeString(choice.name, {
                  encoding: WriteInEncoding,
                  maxLength: MAXIMUM_WRITE_IN_LENGTH,
                })
              }
            }
          }
        }
      }
    }
  }

  return bits
}

export function decodeBallot(
  election: Election,
  data: Uint8Array
): CompletedBallot {
  return decodeBallotFromReader(election, new BitReader(data))
}

export function decodeBallotFromReader(
  election: Election,
  bits: BitReader
): CompletedBallot {
  if (!bits.skipUint8(...Prelude)) {
    throw new Error(
      "expected leading prelude 'V' 'X' 0b00000001 but it was not found"
    )
  }

  const ballotStyleId = bits.readString()
  const ballotStyle = getBallotStyle({ ballotStyleId, election })

  if (!ballotStyle) {
    throw new Error(
      `ballot style with id ${JSON.stringify(
        ballotStyleId
      )} could not be found, expected one of: ${election.ballotStyles
        .map((bs) => bs.id)
        .join(', ')}`
    )
  }

  const precinctId = bits.readString()
  const precinct = getPrecinctById({ precinctId, election })

  if (!precinct) {
    throw new Error(
      `precinct with id ${JSON.stringify(
        precinctId
      )} could not be found, expected one of: ${election.precincts
        .map((p) => p.id)
        .join(', ')}`
    )
  }

  const ballotId = bits.readString()
  const contests = getContests({ ballotStyle, election })
  const votes = decodeBallotVotes(contests, bits)
  const isTestMode = bits.readBoolean()
  const ballotType = bits.readUint({ max: BallotTypeMaximumValue })

  readPaddingToEnd(bits)

  return {
    ballotId,
    ballotStyle,
    precinct,
    votes,
    isTestMode,
    ballotType,
  }
}

function readPaddingToEnd(bits: BitReader): void {
  let padding = 0

  while (bits.canRead()) {
    if (bits.readUint1() !== 0) {
      throw new Error(
        'unexpected data found while reading padding, expected EOF'
      )
    }

    padding += 1
  }

  if (padding >= Uint8Size) {
    throw new Error('unexpected data found while reading padding, expected EOF')
  }
}

function decodeBallotVotes(contests: Contests, bits: BitReader): VotesDict {
  const votes: VotesDict = {}

  // read roll call
  const contestsWithAnswers = contests.flatMap<{
    contest: AnyContest
    hasEitherNeither?: boolean
    hasPickOne?: boolean
  }>((contest) => {
    if (contest.type === 'ms-either-neither') {
      const hasEitherNeither = bits.readBoolean()
      const hasPickOne = bits.readBoolean()

      if (hasEitherNeither || hasPickOne) {
        return [{ contest, hasEitherNeither, hasPickOne }]
      }
    } else if (bits.readBoolean()) {
      return [{ contest }]
    }

    return []
  })

  // read vote data
  for (const { contest, hasEitherNeither, hasPickOne } of contestsWithAnswers) {
    if (contest.type === 'ms-either-neither') {
      if (hasEitherNeither) {
        votes[contest.eitherNeitherContestId] = bits.readBoolean()
          ? ['yes']
          : ['no']
      }
      if (hasPickOne) {
        votes[contest.pickOneContestId] = bits.readBoolean() ? ['yes'] : ['no']
      }
    } else if (contest.type === 'yesno') {
      // yesno votes get a single bit
      votes[contest.id] = bits.readBoolean() ? ['yes'] : ['no']
    } else {
      const contestVote: Candidate[] = []

      // candidate choices get one bit per candidate
      for (const candidate of contest.candidates) {
        if (bits.readBoolean()) {
          contestVote.push(candidate)
        }
      }

      if (contest.allowWriteIns) {
        // read write-in data
        const maximumWriteIns = Math.max(0, contest.seats - contestVote.length)

        if (maximumWriteIns > 0) {
          const writeInCount = bits.readUint({ max: maximumWriteIns })

          for (let i = 0; i < writeInCount; i += 1) {
            const name = bits.readString({
              encoding: WriteInEncoding,
              maxLength: MAXIMUM_WRITE_IN_LENGTH,
            })

            contestVote.push({
              id: `write-in__${name}`,
              name,
              isWriteIn: true,
            })
          }
        }
      }

      votes[contest.id] = contestVote
    }
  }

  return votes
}

export interface HMPBBallotPageMetadata {
  electionHash: string // a hexadecimal string
  precinctId: Precinct['id']
  ballotStyleId: BallotStyle['id']
  locales: BallotLocale
  pageNumber: number
  isTestMode: boolean
  ballotType: BallotType
  ballotId?: string
}

export interface HMPBBallotPageMetadataCheckData {
  electionHash: string
  precinctCount: number
  ballotStyleCount: number
  contestCount: number
}

export function encodeHMPBBallotPageMetadata(
  election: Election,
  metadata: HMPBBallotPageMetadata
): Uint8Array {
  const bits = new BitWriter()
  encodeHMPBBallotPageMetadataInto(election, metadata, bits)
  return bits.toUint8Array()
}

export function encodeHMPBBallotPageMetadataInto(
  election: Election,
  {
    electionHash,
    precinctId,
    ballotStyleId,
    locales,
    pageNumber,
    isTestMode,
    ballotType,
    ballotId,
  }: HMPBBallotPageMetadata,
  bits: BitWriter
): void {
  const { precincts, ballotStyles, contests } = election
  const precinctCount = toUint8(precincts.length)
  const ballotStyleCount = toUint8(ballotStyles.length)
  const contestCount = toUint8(contests.length)

  const precinctIndex = precincts.findIndex((p) => p.id === precinctId)

  if (precinctIndex === -1) {
    throw new Error(`precinct ID not found: ${precinctId}`)
  }

  const ballotStyleIndex = ballotStyles.findIndex(
    (bs) => bs.id === ballotStyleId
  )

  if (ballotStyleIndex === -1) {
    throw new Error(`ballot style ID not found: ${ballotStyleId}`)
  }

  const primaryLocaleIndex = SUPPORTED_LOCALES.indexOf(locales.primary)
  const secondaryLocaleIndex = locales.secondary
    ? SUPPORTED_LOCALES.indexOf(locales.secondary)
    : undefined

  if (primaryLocaleIndex === -1) {
    throw new Error(`primary locale not found: ${locales.primary}`)
  }

  if (secondaryLocaleIndex === -1) {
    throw new Error(`secondary locale not found: ${locales.secondary}`)
  }

  bits
    .writeUint8(...HMPBPrelude)
    .writeString(electionHash, { encoding: HexEncoding })
    .writeUint8(precinctCount, ballotStyleCount, contestCount)
    .writeUint(precinctIndex, { max: precinctCount - 1 })
    .writeUint(ballotStyleIndex, { max: ballotStyleCount - 1 })
    .writeUint(primaryLocaleIndex, { max: SUPPORTED_LOCALES.length - 1 })
    .writeBoolean(!!secondaryLocaleIndex)

  if (secondaryLocaleIndex) {
    bits.writeUint(secondaryLocaleIndex, { max: SUPPORTED_LOCALES.length - 1 })
  }

  bits.writeUint(pageNumber, { max: MAXIMUM_PAGE_NUMBERS })

  bits
    .writeBoolean(isTestMode)
    .writeUint(ballotType, { max: BallotTypeMaximumValue })
    .writeBoolean(!!ballotId)

  if (ballotId) {
    bits.writeString(ballotId)
  }
}

export function decodeHMPBBallotPageMetadataCheckData(
  data: Uint8Array
): HMPBBallotPageMetadataCheckData {
  return decodeHMPBBallotPageMetadataCheckDataFromReader(new BitReader(data))
}

export function decodeHMPBBallotPageMetadataCheckDataFromReader(
  bits: BitReader
): HMPBBallotPageMetadataCheckData {
  if (!bits.skipUint8(...HMPBPrelude)) {
    throw new Error(
      "expected leading prelude 'V' 'P' 0b00000001 but it was not found"
    )
  }

  return {
    electionHash: bits.readString({ encoding: HexEncoding }),
    precinctCount: bits.readUint8(),
    ballotStyleCount: bits.readUint8(),
    contestCount: bits.readUint8(),
  }
}

export function decodeHMPBBallotPageMetadata(
  election: Election,
  data: Uint8Array
): HMPBBallotPageMetadata {
  return decodeHMPBBallotPageMetadataFromReader(election, new BitReader(data))
}

export function decodeHMPBBallotPageMetadataFromReader(
  election: Election,
  bits: BitReader
): HMPBBallotPageMetadata {
  const precincts = election.precincts
  const ballotStyles = election.ballotStyles

  const {
    electionHash,
    ballotStyleCount,
    precinctCount,
  } = decodeHMPBBallotPageMetadataCheckDataFromReader(bits)
  const precinctIndex = bits.readUint({ max: precinctCount - 1 })
  const ballotStyleIndex = bits.readUint({ max: ballotStyleCount - 1 })
  const primaryLocaleIndex = bits.readUint({
    max: SUPPORTED_LOCALES.length - 1,
  })
  const secondaryLocaleIndex = bits.readBoolean()
    ? bits.readUint({ max: SUPPORTED_LOCALES.length - 1 })
    : undefined
  const pageNumber = bits.readUint({ max: MAXIMUM_PAGE_NUMBERS })
  const isTestMode = bits.readBoolean()
  const ballotType = bits.readUint({ max: BallotTypeMaximumValue })
  const ballotId = bits.readBoolean() ? bits.readString() : undefined

  return {
    electionHash,
    precinctId: precincts[precinctIndex].id,
    ballotStyleId: ballotStyles[ballotStyleIndex].id,
    locales: {
      primary: SUPPORTED_LOCALES[primaryLocaleIndex],
      secondary: secondaryLocaleIndex
        ? SUPPORTED_LOCALES[secondaryLocaleIndex]
        : undefined,
    },
    pageNumber,
    isTestMode,
    ballotType,
    ballotId,
  }
}
