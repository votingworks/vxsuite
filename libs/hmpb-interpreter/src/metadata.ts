import { BallotType, Election, v1 } from '@votingworks/ballot-encoder'
import { BallotPageMetadata, DetectQRCode, BallotLocales } from './types'
import defined from './utils/defined'
import * as qrcode from './utils/qrcode'

export interface DetectOptions {
  detectQRCode?: DetectQRCode
}

export interface DetectResult {
  metadata: BallotPageMetadata
  flipped: boolean
}

export class MetadataDecodeError extends Error {}

export function decodeSearchParams(
  searchParams: URLSearchParams
): BallotPageMetadata {
  const type = defined(searchParams.get('t'))
  const precinctId = defined(searchParams.get('pr'))
  const ballotStyleId = defined(searchParams.get('bs'))
  const pageInfo = defined(searchParams.get('p'))

  const primaryLocaleCode = searchParams.get('l1') ?? undefined
  const secondaryLocaleCode = searchParams.get('l2') ?? undefined
  let locales: BallotLocales | undefined

  if (primaryLocaleCode) {
    if (secondaryLocaleCode) {
      locales = { primary: primaryLocaleCode, secondary: secondaryLocaleCode }
    } else {
      locales = { primary: primaryLocaleCode }
    }
  } else {
    locales = { primary: 'en-US' }
  }

  const [typeTestMode] = type.split('', 2)
  const [pageInfoNumber] = pageInfo.split('-', 2)
  const isTestMode = typeTestMode === 't'
  const pageNumber = parseInt(pageInfoNumber, 10)

  return {
    electionHash: '',
    ballotType: BallotType.Standard,
    locales,
    ballotStyleId,
    precinctId,
    isTestMode,
    pageNumber,
  }
}

function isBase64(string: string): boolean {
  return Buffer.from(string, 'base64').toString('base64') === string
}

export function fromString(
  election: Election,
  text: string
): BallotPageMetadata {
  if (isBase64(text)) {
    return fromBytes(election, Buffer.from(text, 'base64'))
  }
  return decodeSearchParams(new URL(text).searchParams)
}

export function fromBytes(
  election: Election,
  data: Buffer
): BallotPageMetadata {
  if (data[0] === 'V'.charCodeAt(0) && data[1] === 'P'.charCodeAt(0)) {
    return v1.decodeHMPBBallotPageMetadata(election, data)
  }

  return fromString(election, new TextDecoder().decode(data))
}

export async function detect(
  election: Election,
  imageData: ImageData,
  { detectQRCode = qrcode.default }: DetectOptions = {}
): Promise<DetectResult> {
  const result = await detectQRCode(imageData)

  if (!result) {
    throw new MetadataDecodeError('Expected QR code not found.')
  }

  return {
    metadata: fromBytes(election, result.data),
    flipped: result.rightSideUp === false,
  }
}
