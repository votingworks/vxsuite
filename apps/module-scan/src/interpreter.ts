//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  CandidateVote,
  CompletedBallot,
  decodeBallot,
  detect,
  Election,
  getContests,
  Optional,
  YesNoVote,
} from '@votingworks/ballot-encoder'
import {
  Interpreter as HMPBInterpreter,
  BallotPageMetadata,
  BallotMark,
  Size,
  BallotPageLayout,
} from '@votingworks/hmpb-interpreter'
import { detect as qrdetect } from '@votingworks/qrdetect'
import makeDebug from 'debug'
import { readFile as readFileCallback } from 'fs'
import { decode as decodeJpeg } from 'jpeg-js'
import { decode as quircDecode } from 'node-quirc'
import { promisify } from 'util'
import { CastVoteRecord } from './types'
import { getMachineId } from './util/machineId'

const debug = makeDebug('module-scan:interpreter')

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
}

export interface MarkInfo {
  marks: BallotMark[]
  ballotSize: Size
}

export interface InterpretedBallot {
  cvr: CastVoteRecord
  normalizedImage: ImageData
  marks?: MarkInfo
  metadata?: BallotPageMetadata
}

export interface Interpreter {
  addHmpbTemplate(
    election: Election,
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  addHmpbTemplate(
    election: Election,
    layout: BallotPageLayout
  ): Promise<BallotPageLayout>
  interpretFile(
    interpretFileParams: InterpretFileParams
  ): Promise<InterpretedBallot | undefined>
  setTestMode(testMode: boolean): void
}

const readFile = promisify(readFileCallback)

interface InterpretBallotStringParams {
  readonly election: Election
  readonly encodedBallot: Uint8Array
}

function ballotToCastVoteRecord(ballot: CompletedBallot): CastVoteRecord {
  const { election, ballotStyle, precinct, ballotId, isTestBallot } = ballot

  // figure out the contests
  const contests = getContests({ ballotStyle, election })

  // prepare the CVR
  const cvr: CastVoteRecord = {
    _precinctId: precinct.id,
    _ballotId: ballotId,
    _ballotStyleId: ballotStyle.id,
    _testBallot: isTestBallot,
    _scannerId: getMachineId(),
  }

  for (const contest of contests) {
    // no answer for a particular contest is recorded in our final dictionary as an empty string
    // not the same thing as undefined.
    let cvrForContest: string[] = []
    const vote = ballot.votes[contest.id]

    if (contest.type === 'yesno') {
      if (vote) {
        cvrForContest = [vote as YesNoVote]
      }
    } else if (contest.type === 'candidate') {
      // selections for this question
      const candidates = vote as Optional<CandidateVote>

      if (candidates && candidates.length > 0) {
        cvrForContest = candidates.map((candidate) =>
          candidate.isWriteIn ? '__write-in' : candidate.id
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
}: InterpretBallotStringParams): CastVoteRecord {
  const { ballot } = decodeBallot(election, encodedBallot)
  return ballotToCastVoteRecord(ballot)
}

interface BallotImageData {
  file: Buffer
  image: ImageData
  qrcode: Buffer
}

export async function getBallotImageData(
  filepath: string
): Promise<BallotImageData> {
  const file = await readFile(filepath)
  const { data, width, height } = decodeJpeg(file)
  const image = { data: Uint8ClampedArray.from(data), width, height }
  const quircCodes = await quircDecode(file)

  if (quircCodes.length > 0) {
    return { file, image, qrcode: quircCodes[0].data }
  }

  const qrdetectCodes = qrdetect(data, width, height)

  if (qrdetectCodes.length > 0) {
    return { file, image, qrcode: qrdetectCodes[0].data }
  }

  throw new Error(`no QR code found in ${filepath}`)
}

export default class SummaryBallotInterpreter implements Interpreter {
  private hmpbInterpreter?: HMPBInterpreter
  private testMode?: boolean

  async addHmpbTemplate(
    election: Election,
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(
    election: Election,
    layout: BallotPageLayout
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(
    election: Election,
    imageDataOrLayout: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout> {
    const interpreter = this.getHmbpInterpreter(election)
    let layout: BallotPageLayout

    if ('data' in imageDataOrLayout) {
      layout = await interpreter.interpretTemplate(imageDataOrLayout, metadata)
    } else {
      layout = imageDataOrLayout
    }

    ;({ metadata } = layout.ballotImage)

    if (metadata.isTestBallot === this.testMode) {
      await interpreter.addTemplate(layout)
    }

    debug(
      'Added HMPB template page %d/%d: ballotStyleId=%s precinctId=%s isTestBallot=%s',
      metadata.pageNumber,
      metadata.pageCount,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )

    return layout
  }

  // eslint-disable-next-line class-methods-use-this
  public async interpretFile({
    election,
    ballotImagePath,
  }: InterpretFileParams): Promise<InterpretedBallot | undefined> {
    let ballotImageData: BallotImageData

    try {
      ballotImageData = await getBallotImageData(ballotImagePath)
    } catch (error) {
      debug('interpretFile failed with error: %s', error.message)
      return
    }

    const bmdResult = await this.interpretBMDFile(election, ballotImageData)

    if (bmdResult) {
      return bmdResult
    }

    return await this.interpretHMPBFile(election, ballotImageData)
  }

  public setTestMode(testMode: boolean): void {
    this.testMode = testMode
    this.hmpbInterpreter = undefined
  }

  private async interpretBMDFile(
    election: Election,
    { qrcode, image }: BallotImageData
  ): Promise<InterpretedBallot | undefined> {
    if (typeof detect(qrcode) === 'undefined') {
      return
    }

    const cvr = interpretBallotData({ election, encodedBallot: qrcode })

    if (cvr) {
      return { cvr, normalizedImage: image }
    }
  }

  private async interpretHMPBFile(
    election: Election,
    { image }: BallotImageData
  ): Promise<InterpretedBallot | undefined> {
    const hmpbInterpreter = this.getHmbpInterpreter(election)
    const {
      ballot,
      marks,
      mappedBallot,
      metadata,
    } = await hmpbInterpreter.interpretBallot(image)

    return {
      cvr: ballotToCastVoteRecord(ballot),
      normalizedImage: mappedBallot,
      marks: {
        marks,
        ballotSize: {
          width: mappedBallot.width,
          height: mappedBallot.height,
        },
      },
      metadata,
    }
  }

  private getHmbpInterpreter(election: Election): HMPBInterpreter {
    if (!this.hmpbInterpreter) {
      if (typeof this.testMode === 'undefined') {
        throw new Error(
          'testMode has not been configured; please set it to true or false before interpreting ballots'
        )
      }

      this.hmpbInterpreter = new HMPBInterpreter({
        election,
        testMode: this.testMode,
      })
    }
    return this.hmpbInterpreter
  }
}
