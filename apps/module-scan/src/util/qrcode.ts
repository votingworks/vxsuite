import { detect } from '@votingworks/ballot-encoder'
import { Rect, Size } from '@votingworks/hmpb-interpreter'
import crop from '@votingworks/hmpb-interpreter/dist/src/utils/crop'
import { detect as qrdetect } from '@votingworks/qrdetect'
import makeDebug from 'debug'
import { decode as quircDecode } from 'node-quirc'
import { toPNG } from './images'
import { time } from './perf'

const debug = makeDebug('module-scan:qrcode')

function isBase64(string: string): boolean {
  return Buffer.from(string, 'base64').toString('base64') === string
}

function maybeDecodeBase64(data: Buffer): Buffer {
  try {
    if (typeof detect(data) !== 'undefined') {
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
  const hmpbWidth = Math.round((size.width * 3) / 4)
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
): Promise<{ data: Buffer; position: 'top' | 'bottom' } | undefined> => {
  const timer = time('detectQRCode')
  let result: { data: Buffer; position: 'top' | 'bottom' } | undefined

  debug('detectQRCode: checking %dˣ%d image', imageData.width, imageData.height)

  for (const { position, bounds } of getSearchAreas(imageData)) {
    debug('cropping %s to check for QR code: %o', position, bounds)
    const cropped = crop(imageData, bounds)
    debug('scanning with qrdetect')
    const results = qrdetect(cropped.data, cropped.width, cropped.height)

    if (results.length > 0) {
      debug(
        'qrdetect found QR code in %s! data length=%d',
        position,
        results[0].data.length
      )
      const data = maybeDecodeBase64(results[0].data)

      result = { data, position }
    } else {
      debug('qrdetect found no QR codes in %s', position)
    }

    if (result) {
      break
    }
  }

  if (!result) {
    for (const { position, bounds } of getSearchAreas(imageData)) {
      debug('cropping %s to check for QR code: %o', position, bounds)
      const cropped = crop(imageData, bounds)

      debug('generating PNG for quirc')
      const img = await toPNG(cropped)

      debug('scanning with quirc')
      const results = (await quircDecode(img))[0]

      if (results && 'data' in results) {
        debug(
          'quirc found QR code in %s! data length=%d',
          position,
          results.data.length
        )
        const data = maybeDecodeBase64(results.data)

        result = { data, position }
      } else {
        debug('quirc found no QR codes in %s', position)
      }

      if (result) {
        break
      }
    }
  }

  if (!result) {
    debug('detectQRCode: no QR code found')
  }

  timer.end()
  return result
}
