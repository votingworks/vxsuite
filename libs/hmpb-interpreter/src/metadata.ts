import { BallotPageMetadata } from './types'
import crop from './utils/crop'
import defined from './utils/defined'
import * as qrcode from './utils/qrcode'

export type DecodeQRCode = (imageData: ImageData) => Promise<Buffer | undefined>

export class MetadataDecodeError extends Error {}

export function decodeSearchParams(
  searchParams: URLSearchParams
): BallotPageMetadata {
  const type = defined(searchParams.get('t'))
  const precinctId = defined(searchParams.get('pr'))
  const ballotStyleId = defined(searchParams.get('bs'))
  const pageInfo = defined(searchParams.get('p'))

  const [typeTestBallot] = type.split('', 2)
  const [pageInfoNumber, pageInfoCount] = pageInfo.split('-', 2)

  const isTestBallot = typeTestBallot === 't'

  const pageNumber = parseInt(pageInfoNumber, 10)
  const pageCount = parseInt(pageInfoCount, 10)

  return {
    ballotStyleId,
    precinctId,
    isTestBallot,
    pageCount,
    pageNumber,
  }
}

export async function detect(
  imageData: ImageData,
  { decodeQRCode = qrcode.decode }: { decodeQRCode?: DecodeQRCode } = {}
): Promise<BallotPageMetadata> {
  const x = Math.floor((imageData.width * 7) / 8)
  const y = Math.floor((imageData.height * 7) / 8)
  const cropped = crop(imageData, {
    x,
    y,
    width: imageData.width - x,
    height: imageData.height - y,
  })
  const data = await decodeQRCode(cropped)

  if (!data) {
    throw new MetadataDecodeError('Expected QR code not found.')
  }

  const qrtext = new TextDecoder().decode(data)
  return decodeSearchParams(new URL(qrtext).searchParams)
}
