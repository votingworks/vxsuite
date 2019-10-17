//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  CandidateVote,
  CompletedBallot,
  decodeBallot,
  Election,
  getContests,
  Optional,
  OptionalYesNoVote,
} from '@votingworks/ballot-encoder'
import { readFile as readFileCallback } from 'fs'
import { decode } from 'node-quirc'
import { promisify } from 'util'
import { CastVoteRecord, CVRCallbackFunction } from './types'

const readFile = promisify(readFileCallback)

export interface InterpretBallotStringParams {
  readonly election: Election
  readonly encodedBallot: Uint8Array
}

export function ballotToCastVoteRecord(
  ballot: CompletedBallot
): CastVoteRecord | undefined {
  // TODO: Replace all this with a `CompletedBallot` -> `CastVoteRecord` mapper.
  const { election, ballotStyle, precinct, ballotId } = ballot

  // figure out the contests
  const contests = getContests({ ballotStyle, election })

  // prepare the CVR
  const cvr: CastVoteRecord = {
    _precinctId: precinct.id,
    _ballotId: ballotId,
    _ballotStyleId: ballotStyle.id,
  }

  for (const contest of contests) {
    // no answer for a particular contest is recorded in our final dictionary as an empty string
    // not the same thing as undefined.
    let cvrForContest: string | string[] = ''
    const vote = ballot.votes[contest.id]

    if (contest.type === 'yesno') {
      cvrForContest = (vote as OptionalYesNoVote) || ''
    } else if (contest.type === 'candidate') {
      // selections for this question
      const candidates = vote as Optional<CandidateVote>

      if (candidates && candidates.length > 0) {
        cvrForContest = candidates.map(candidate =>
          candidate.isWriteIn ? 'writein' : candidate.id
        )
      }
    }

    cvr[contest.id] = cvrForContest
  }

  return cvr
}

export function interpretBallotData({
  election,
  encodedBallot,
}: InterpretBallotStringParams): CastVoteRecord | undefined {
  const { ballot } = decodeBallot(election, encodedBallot)
  return ballotToCastVoteRecord(ballot)
}

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
  readonly cvrCallback: CVRCallbackFunction
}

export async function readQRCodesFromImageFile(
  path: string
): Promise<Buffer[]> {
  const jpegData = await readFile(path)
  const qrCodes = await decode(jpegData)

  return qrCodes.map(({ data }) => data)
}

export default async function interpretFile(
  interpretFileParams: InterpretFileParams
) {
  const { election, ballotImagePath, cvrCallback } = interpretFileParams
  let encodedBallot: Uint8Array

  try {
    const qrCodes = await readQRCodesFromImageFile(ballotImagePath)

    if (qrCodes.length === 0) {
      throw new Error(`no QR codes found in ballot image: ${ballotImagePath}`)
    }

    encodedBallot = qrCodes[0]
  } catch {
    return cvrCallback({ ballotImagePath })
  }

  const cvr = interpretBallotData({ election, encodedBallot })
  cvrCallback({ ballotImagePath, cvr })
}
