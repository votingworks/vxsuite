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

// TODO: do dependency-injection here instead
import { RealZBarImage } from './zbarimg'

const zbarimg = new RealZBarImage()

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

async function readQRCodeFromImageData(
  imageData: Buffer
): Promise<Buffer | undefined> {
  const qrCodes = await decode(imageData)

  return qrCodes.length > 0 ? qrCodes[0].data : undefined
}

export async function readQRCodeFromImageFile(
  path: string
): Promise<Buffer | undefined> {
  const imageData = await readFile(path)
  return (
    (await readQRCodeFromImageData(imageData)) ||
    (await zbarimg.readQRCodeFromImage(path))
  )
}

export default async function interpretFile(
  interpretFileParams: InterpretFileParams
) {
  const { election, ballotImagePath, cvrCallback } = interpretFileParams

  try {
    const encodedBallot = await readQRCodeFromImageFile(ballotImagePath)

    if (!encodedBallot) {
      throw new Error(`no QR codes found in ballot image: ${ballotImagePath}`)
    }

    const cvr = interpretBallotData({ election, encodedBallot })
    cvrCallback({ ballotImagePath, cvr })
  } catch {
    return cvrCallback({ ballotImagePath })
  }
}
