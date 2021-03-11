import { strict as assert } from 'assert'
import {
  BitReader,
  BitWriter,
  CustomEncoding,
  toUint8,
  Uint8,
  Uint8Size,
} from './bits'
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
} from '@votingworks/types'

export const MAXIMUM_WRITE_IN_LENGTH = 40
export const MAXIMUM_PAGE_NUMBERS = 30
export const ELECTION_HASH_LENGTH = 20

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
  /* version = */ 2,
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

export interface BallotConfig {
  ballotId?: string
  ballotStyleId: string
  ballotType: BallotType
  isTestMode: boolean
  locales?: BallotLocale
  pageNumber?: number
  precinctId: string
}

export function encodeBallotConfigInto(
  election: Election,
  {
    ballotId,
    ballotStyleId,
    ballotType,
    isTestMode,
    locales,
    pageNumber,
    precinctId,
  }: BallotConfig,
  bits: BitWriter
): BitWriter {
  const { precincts, ballotStyles, contests } = election
  const precinctCount = toUint8(precincts.length)
  const ballotStyleCount = toUint8(ballotStyles.length)
  const contestCount = toUint8(contests.length)
  const precinctIndex = precincts.findIndex((p) => p.id === precinctId)
  const ballotStyleIndex = ballotStyles.findIndex(
    (bs) => bs.id === ballotStyleId
  )

  if (precinctIndex === -1) {
    throw new Error(`precinct ID not found: ${precinctId}`)
  }

  if (ballotStyleIndex === -1) {
    throw new Error(`ballot style ID not found: ${ballotStyleId}`)
  }

  bits
    .writeUint8(precinctCount, ballotStyleCount, contestCount)
    .writeUint(precinctIndex, { max: precinctCount - 1 })
    .writeUint(ballotStyleIndex, { max: ballotStyleCount - 1 })

  if (locales) {
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
      .writeUint(primaryLocaleIndex, { max: SUPPORTED_LOCALES.length - 1 })
      .writeBoolean(!!secondaryLocaleIndex)

    if (secondaryLocaleIndex) {
      bits.writeUint(secondaryLocaleIndex, {
        max: SUPPORTED_LOCALES.length - 1,
      })
    }
  }

  if (typeof pageNumber === 'number') {
    bits.writeUint(pageNumber, { max: MAXIMUM_PAGE_NUMBERS })
  }

  bits
    .writeBoolean(isTestMode)
    .writeUint(ballotType, { max: BallotTypeMaximumValue })

  bits.writeBoolean(!!ballotId)

  if (ballotId) {
    bits.writeString(ballotId)
  }

  return bits
}

export function decodeBallotConfigFromReader(
  election: Election,
  {
    readLocales,
    readPageNumber,
  }: { readLocales: false; readPageNumber: false },
  bits: BitReader
): BallotConfig & { locales: undefined; pageNumber: undefined }
export function decodeBallotConfigFromReader(
  election: Election,
  { readLocales, readPageNumber }: { readLocales: false; readPageNumber: true },
  bits: BitReader
): BallotConfig & { locales: undefined; pageNumber: number }
export function decodeBallotConfigFromReader(
  election: Election,
  { readLocales, readPageNumber }: { readLocales: true; readPageNumber: false },
  bits: BitReader
): BallotConfig & { locales: BallotLocale; pageNumber: undefined }
export function decodeBallotConfigFromReader(
  election: Election,
  { readLocales, readPageNumber }: { readLocales: true; readPageNumber: true },
  bits: BitReader
): BallotConfig & { locales: BallotLocale; pageNumber: number }
export function decodeBallotConfigFromReader(
  election: Election,
  {
    readLocales,
    readPageNumber,
  }: { readLocales: boolean; readPageNumber: boolean },
  bits: BitReader
): BallotConfig {
  const { precincts, ballotStyles, contests } = election
  const precinctCount = bits.readUint8()
  const ballotStyleCount = bits.readUint8()
  const contestCount = bits.readUint8()

  if (precinctCount !== precincts.length) {
    throw new Error(
      `expected ${precincts.length} precinct(s), but read ${precinctCount} from encoded config`
    )
  }

  if (ballotStyleCount !== ballotStyles.length) {
    throw new Error(
      `expected ${ballotStyles.length} ballot style(s), but read ${ballotStyleCount} from encoded config`
    )
  }

  const precinctIndex = bits.readUint({ max: precinctCount - 1 })
  const ballotStyleIndex = bits.readUint({ max: ballotStyleCount - 1 })

  if (contestCount !== contests.length) {
    throw new Error(
      `expected ${contests.length} contest(s), but read ${contestCount} from encoded config`
    )
  }

  const primaryLocaleIndex = readLocales
    ? bits.readUint({
        max: SUPPORTED_LOCALES.length - 1,
      })
    : undefined
  const secondaryLocaleIndex =
    readLocales && bits.readBoolean()
      ? bits.readUint({ max: SUPPORTED_LOCALES.length - 1 })
      : undefined
  const pageNumber = readPageNumber
    ? bits.readUint({ max: MAXIMUM_PAGE_NUMBERS })
    : undefined
  const isTestMode = bits.readBoolean()
  const ballotType = bits.readUint({ max: BallotTypeMaximumValue })
  const ballotId = bits.readBoolean() ? bits.readString() : undefined

  return {
    ballotId,
    ballotStyleId: ballotStyles[ballotStyleIndex].id,
    ballotType,
    isTestMode,
    precinctId: precincts[precinctIndex].id,
    locales:
      readLocales && typeof primaryLocaleIndex === 'number'
        ? {
            primary: SUPPORTED_LOCALES[primaryLocaleIndex],
            secondary:
              typeof secondaryLocaleIndex === 'number'
                ? SUPPORTED_LOCALES[secondaryLocaleIndex]
                : undefined,
          }
        : undefined,
    pageNumber,
  }
}

export function encodeBallot(
  election: Election,
  ballot: CompletedBallot
): Uint8Array {
  const bits = new BitWriter()
  encodeBallotInto(election, ballot, bits)
  return bits.toUint8Array()
}

export function encodeBallotInto(
  election: Election,
  {
    electionHash,
    ballotStyleId,
    precinctId,
    votes,
    ballotId,
    isTestMode,
    ballotType,
  }: CompletedBallot,
  bits: BitWriter
): BitWriter {
  const ballotStyle = getBallotStyle({ election, ballotStyleId })

  if (!ballotStyle) {
    throw new Error(`unknown ballot style id: ${ballotStyleId}`)
  }

  validateVotes({ election, ballotStyle, votes })

  const contests = getContests({ ballotStyle, election })

  return bits
    .writeUint8(...Prelude)
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
    })
    .with(() =>
      encodeBallotConfigInto(
        election,
        {
          ballotId,
          ballotStyleId,
          precinctId,
          ballotType,
          isTestMode,
        },
        bits
      )
    )
    .with(() => encodeBallotVotesInto(contests, votes, bits))
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
      "expected leading prelude 'V' 'X' 0b00000002 but it was not found"
    )
  }

  const electionHash = bits.readString({
    encoding: HexEncoding,
    length: ELECTION_HASH_LENGTH,
  })

  const {
    ballotId = '',
    ballotStyleId,
    ballotType,
    isTestMode,
    precinctId,
  } = decodeBallotConfigFromReader(
    election,
    { readLocales: false, readPageNumber: false },
    bits
  )
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const precinct = getPrecinctById({ precinctId, election })

  assert(ballotStyle, `invalid ballot style id: ${ballotStyleId}`)
  assert(precinct, `invalid precinct id: ${precinctId}`)

  const contests = getContests({ ballotStyle, election })
  const votes = decodeBallotVotes(contests, bits)

  readPaddingToEnd(bits)

  return {
    electionHash,
    ballotId,
    ballotStyleId,
    precinctId,
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
  return encodeHMPBBallotPageMetadataInto(
    election,
    metadata,
    new BitWriter()
  ).toUint8Array()
}

export function encodeHMPBBallotPageMetadataInto(
  election: Election,
  {
    ballotId,
    ballotStyleId,
    ballotType,
    electionHash,
    isTestMode,
    locales,
    pageNumber,
    precinctId,
  }: HMPBBallotPageMetadata,
  bits: BitWriter
): BitWriter {
  return (
    bits
      .writeUint8(...HMPBPrelude)
      // TODO: specify the length so we don't have to write a length-prefixed
      // string, saving us a byte in the QR code.
      .writeString(electionHash, { encoding: HexEncoding })
      .with(() =>
        encodeBallotConfigInto(
          election,
          {
            ballotId,
            ballotStyleId,
            ballotType,
            isTestMode,
            locales,
            pageNumber,
            precinctId,
          },
          bits
        )
      )
  )
}

/**
 * Reads the HMPB prelude bytes from `data`, returning true when they are found.
 */
export function detectHMPBBallotPageMetadata(data: Uint8Array): boolean {
  return detectHMPBBallotPageMetadataFromReader(new BitReader(data))
}

/**
 * Reads the election hash from an encoded ballot or encoded HMPB metadata.
 */
export function decodeElectionHash(data: Uint8Array): string | undefined {
  return decodeElectionHashFromReader(new BitReader(data))
}

/**
 * Reads the election hash from an encoded ballot or encoded HMPB metadata.
 */
export function decodeElectionHashFromReader(
  bits: BitReader
): string | undefined {
  if (bits.skipUint8(...HMPBPrelude)) {
    return bits.readString({ encoding: HexEncoding })
  }

  if (bits.skipUint8(...Prelude)) {
    return bits.readString({
      encoding: HexEncoding,
      length: ELECTION_HASH_LENGTH,
    })
  }
}

/**
 * Reads the HMPB prelude bytes from `bits`. When detected, the cursor of `bits`
 * will be updated to skip the prelude bytes.
 */
export function detectHMPBBallotPageMetadataFromReader(
  bits: BitReader
): boolean {
  return bits.skipUint8(...HMPBPrelude)
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
  if (!detectHMPBBallotPageMetadataFromReader(bits)) {
    throw new Error(
      "expected leading prelude 'V' 'P' 0b00000001 but it was not found"
    )
  }

  const electionHash = bits.readString({ encoding: HexEncoding })
  const {
    ballotId,
    ballotStyleId,
    ballotType,
    isTestMode,
    locales,
    pageNumber,
    precinctId,
  } = decodeBallotConfigFromReader(
    election,
    { readLocales: true, readPageNumber: true },
    bits
  )

  return {
    electionHash,
    precinctId,
    ballotStyleId,
    locales,
    pageNumber,
    isTestMode,
    ballotType,
    ballotId,
  }
}
