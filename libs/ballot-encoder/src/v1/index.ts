import { CandidateVote, Contests, VotesDict } from '../election'
import { BitReader, BitWriter, CustomEncoding } from '../bits'

export const MAXIMUM_WRITE_IN_LENGTH = 40

// TODO: include "magic number" and encoding version

const WriteInEncoding = new CustomEncoding('ABCDEFGHIJKLMNOPQRSTUVWXYZ \'"-.,')

export function encodeVotesInto(
  contests: Contests,
  votes: VotesDict,
  bits: BitWriter
): void {
  // write roll call
  for (const contest of contests) {
    const contestVote = votes[contest.id]
    bits.writeUint1(contestVote ? 1 : 0)
  }

  // write vote data
  for (const contest of contests) {
    const contestVote = votes[contest.id]

    if (contestVote) {
      if (contest.type === 'yesno') {
        // yesno votes get a single bit
        bits.writeBoolean(contestVote === 'yes')
      } else {
        const choices = contestVote as CandidateVote

        // candidate choices get one bit per candidate
        for (const candidate of contest.candidates) {
          bits.writeBoolean(choices.some(choice => choice.id === candidate.id))
        }

        if (contest.allowWriteIns) {
          // write write-in data
          const writeInCount = choices.reduce(
            (count, choice) => count + (choice.isWriteIn ? 1 : 0),
            0
          )
          const nonWriteInCount = choices.length - writeInCount
          const maximumWriteIns = Math.max(0, contest.seats - nonWriteInCount)

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

export function encodeVotes(contests: Contests, votes: VotesDict): Uint8Array {
  const bits = new BitWriter()
  encodeVotesInto(contests, votes, bits)
  return bits.toUint8Array()
}

export function decodeVotesFrom(
  contests: Contests,
  bits: BitReader
): VotesDict {
  const votes: VotesDict = {}

  // read roll call
  const contestsWithAnswers = contests.filter(() => bits.readUint1())

  // read vote data
  for (const contest of contestsWithAnswers) {
    if (contest.type === 'yesno') {
      // yesno votes get a single bit
      votes[contest.id] = bits.readUint1() ? 'yes' : 'no'
    } else {
      const contestVote: CandidateVote = []

      // candidate choices get one bit per candidate
      for (const candidate of contest.candidates) {
        if (bits.readBoolean()) {
          contestVote.push(candidate)
        }
      }

      if (contest.allowWriteIns) {
        // read write-in data
        const maximumWriteIns = Math.max(0, contest.seats - contestVote.length)
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

      votes[contest.id] = contestVote
    }
  }

  return votes
}

export function decodeVotes(contests: Contests, data: Uint8Array): VotesDict {
  return decodeVotesFrom(contests, new BitReader(data))
}
