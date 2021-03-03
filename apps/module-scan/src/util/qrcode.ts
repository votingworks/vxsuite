import { detect } from '@votingworks/ballot-encoder'
import { Rect, Size } from '@votingworks/hmpb-interpreter'
import crop from '@votingworks/hmpb-interpreter/dist/src/utils/crop'
import { detect as qrdetect } from '@votingworks/qrdetect'
import makeDebug from 'debug'
import jsQR from 'jsqr'
import { decode as quircDecode, QRCode } from 'node-quirc'
import { time } from './perf'

const debug = makeDebug('module-scan:qrcode')

function isBase64(string: string): boolean {
  return Buffer.from(string, 'base64').toString('base64') === string
}

function maybeDecodeBase64(data: Buffer): Buffer {
  try {
    if (detect(data)) {
      // BMD ballot, leave it
      return data
    }

    const base64string = new TextDecoder().decode(data)

    if (!isBase64(base64string)) {
      // not base64, leave it
      return data
    }
    const decodedData = Buffer.from(base64string, 'base64')
    return decodedData
  } catch {
    return data
  }
}

export function* getSearchAreas(
  size: Size
): Generator<{ position: 'top' | 'bottom'; bounds: Rect }> {
  // QR code for HMPB is bottom right of legal, so appears bottom right or top left
  const hmpbWidth = Math.round(size.width / 4)
  const hmpbHeight = Math.round(size.height / 8)
  // We look at the top first because we're assuming people will mostly scan sheets
  // so they appear right-side up to them, but bottom-side first to the scanner.
  yield {
    position: 'top',
    bounds: { x: 0, y: 0, width: hmpbWidth, height: hmpbHeight },
  }
  yield {
    position: 'bottom',
    bounds: {
      x: size.width - hmpbWidth,
      y: size.height - hmpbHeight,
      width: hmpbWidth,
      height: hmpbHeight,
    },
  }

  // QR code for BMD is top right of letter, so appears top right or bottom left
  const bmdWidth = Math.round((size.width * 2) / 5)
  const bmdHeight = Math.round((size.height * 2) / 5)
  // We look at the top first because we're assuming people will mostly scan sheets
  // so they appear right-side up to them, but bottom-side first to the scanner.
  yield {
    position: 'bottom',
    bounds: {
      x: 0,
      y: size.height - bmdHeight,
      width: bmdWidth,
      height: bmdHeight,
    },
  }
  yield {
    position: 'top',
    bounds: {
      x: size.width - bmdWidth,
      y: 0,
      width: bmdWidth,
      height: bmdHeight,
    },
  }
}

export const detectQRCode = async (
  imageData: ImageData
): Promise<
  { data: Buffer; position: 'top' | 'bottom'; detector: string } | undefined
> => {
  debug('detectQRCode: checking %dˣ%d image', imageData.width, imageData.height)

  const detectors = [
    {
      name: 'qrdetect',
      detect: async ({ data, width, height }: ImageData): Promise<Buffer[]> =>
        qrdetect(data, width, height).map((symbol) => symbol.data),
    },
    {
      name: 'quirc',
      detect: async (imageData: ImageData): Promise<Buffer[]> => {
        const results = await quircDecode(imageData)
        return results
          .filter((result): result is QRCode => !('err' in result))
          .map((result) => result.data)
      },
    },
    {
      name: 'jsQR',
      detect: async ({ data, width, height }: ImageData): Promise<Buffer[]> => {
        const result = jsQR(data, width, height)
        return result ? [Buffer.from(result.binaryData)] : []
      },
    },
  ]

  const timer = time('detectQRCode')
  try {
    for (const detector of detectors) {
      for (const { position, bounds } of getSearchAreas(imageData)) {
        debug('cropping %s to check for QR code: %o', position, bounds)
        const cropped = crop(imageData, bounds)
        debug('scanning with %s', detector.name)
        const results = await detector.detect(cropped)

        if (results.length > 0) {
          debug(
            '%s found QR code in %s! data length=%d',
            detector.name,
            position,
            results[0].length
          )
          const data = maybeDecodeBase64(results[0])

          return { data, position, detector: detector.name }
        } else {
          debug('%s found no QR codes in %s', detector.name, position)
        }
      }
    }
  } finally {
    timer.end()
  }
}
