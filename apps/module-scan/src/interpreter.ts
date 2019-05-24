//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import * as ImageJS from 'image-js'
import jsQR from 'jsqr'

import {
  BallotStyle,
  CandidateContest,
  CastVoteRecord,
  Contest,
  Contests,
  CVRCallbackFunction,
  Dictionary,
  Election,
} from './types'

interface Rectangle {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

// @ts-ignore image type not defined
const cropAndScan = (image: Image, rectangle: Rectangle) => {
  const subImage = image.crop(rectangle)
  const scanResult = jsQR(subImage.data, subImage.width, subImage.height)

  return scanResult
}

// @ts-ignore image type not defined
const scan = (image: Image) => {
  // the QR code is roughly in the top-right 1/4 * 2/5 corner
  // or equivalent bottom-left corner. Looking at smaller portions
  // of the image increases the chance of recognizing the QR code
  // at lower resolutions

  const [width, height] = image.sizes

  const firstScan = cropAndScan(image, {
    x: width / 2,
    width: width / 4,
    y: 0,
    height: height / 4,
  })

  if (firstScan) {
    return firstScan
  }

  const secondScan = cropAndScan(image, {
    x: width / 4,
    width: width / 4,
    y: (height * 3) / 4 - 1,
    height: height / 4,
  })

  return secondScan
}

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
  readonly cvrCallback: CVRCallbackFunction
}

export default function interpretFile(
  interpretFileParams: InterpretFileParams
) {
  const { election, ballotImagePath, cvrCallback } = interpretFileParams

  const yesNoValues: Dictionary<string> = { '0': 'no', '1': 'yes' }

  ImageJS.Image.load(ballotImagePath).then(function(image: typeof Image) {
    const scanResult = scan(image)
    if (!scanResult) {
      return
    }

    const qrData: string = scanResult.data
    const [
      ballotStyleId,
      precinctId,
      allSelections,
      serialNumber,
    ] = qrData.split('.')

    // figure out the contests
    const ballotStyle = election.ballotStyles.find(
      (b: BallotStyle) => b.id === ballotStyleId
    )

    if (!ballotStyle) {
      return
    }

    const contests: Contests = election.contests.filter(
      (c: Contest) =>
        ballotStyle.districts.includes(c.districtId) &&
        ballotStyle.partyId === c.partyId
    )

    // prepare the CVR
    let cvr: CastVoteRecord = {}

    const allSelectionsList = allSelections.split('|')
    contests.forEach((contest: Contest, contestNum: number) => {
      // no answer for a particular contest is recorded in our final dictionary as an empty string
      // not the same thing as undefined.

      if (contest.type === 'yesno') {
        cvr[contest.id] = yesNoValues[allSelectionsList[contestNum]] || ''
      } else {
        if (contest.type === 'candidate') {
          // selections for this question
          const selections = allSelectionsList[contestNum].split(',')
          if (selections.length > 1 || selections[0] !== '') {
            cvr[contest.id] = selections.map(selection =>
              selection === 'W'
                ? 'writein'
                : (contest as CandidateContest).candidates[parseInt(selection)]
                    .id
            )
          } else {
            cvr[contest.id] = ''
          }
        }
      }
    })

    cvr['_precinctId'] = precinctId
    cvr['_serialNumber'] = serialNumber

    cvrCallback(ballotImagePath, cvr)
  })
}
