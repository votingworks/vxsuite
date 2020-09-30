import { detect } from '@votingworks/ballot-encoder'
import { Rect, Size } from '@votingworks/hmpb-interpreter'
import crop from '@votingworks/hmpb-interpreter/dist/src/utils/crop'
import { detect as qrdetect } from '@votingworks/qrdetect'
import makeDebug from 'debug'

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
  const clipHeight = Math.round(size.height / 2.5)
  yield {
    position: 'top',
    bounds: { x: 0, y: 0, width: size.width, height: clipHeight },
  }
  yield {
    position: 'bottom',
    bounds: {
      x: 0,
      y: size.height - clipHeight,
      width: size.width,
      height: clipHeight,
    },
  }
}

export const detectQRCode = async (
  imageData: ImageData
): Promise<{ data: Buffer; position: 'top' | 'bottom' } | undefined> => {
  debug('detectQRCode: checking %dˣ%d image', imageData.width, imageData.height)

  for (const { position, bounds } of getSearchAreas(imageData)) {
    debug('cropping %s to check for QR code: %o', position, bounds)
    const cropped = crop(imageData, bounds)
    debug('scanning with qrdetect')
    const results = qrdetect(cropped.data, cropped.width, cropped.height)

    if (results.length > 0) {
      debug(
        'found QR code in %s! data length=%d',
        position,
        results[0].data.length
      )
      const data = maybeDecodeBase64(results[0].data)

      return { data, position }
    }
  }

  debug('detectQRCode: no QR code found')
  return undefined
}
