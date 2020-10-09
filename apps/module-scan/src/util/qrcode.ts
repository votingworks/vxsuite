import { detect } from '@votingworks/ballot-encoder'
import { Rect, Size } from '@votingworks/hmpb-interpreter'
import crop from '@votingworks/hmpb-interpreter/dist/src/utils/crop'
import { detect as qrdetect } from '@votingworks/qrdetect'
import { decode as quircDecode } from 'node-quirc'
import makeDebug from 'debug'

import sharp, { Channels } from 'sharp'

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
  yield {
    position: 'bottom',
    bounds: {
      x: size.width - hmpbWidth,
      y: size.height - hmpbHeight,
      width: hmpbWidth,
      height: hmpbHeight,
    },
  }
  yield {
    position: 'top',
    bounds: { x: 0, y: 0, width: hmpbWidth, height: hmpbHeight },
  }

  // QR code for BMD is top right of letter, so appears top right or bottom left
  const bmdWidth = Math.round((size.width * 2) / 5)
  const bmdHeight = Math.round((size.height * 2) / 5)
  yield {
    position: 'top',
    bounds: {
      x: size.width - bmdWidth,
      y: 0,
      width: bmdWidth,
      height: bmdHeight,
    },
  }
  yield {
    position: 'bottom',
    bounds: {
      x: 0,
      y: size.height - bmdHeight,
      width: bmdWidth,
      height: bmdHeight,
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
    } else {
      const { data, width, height } = cropped
      const img = await sharp(Buffer.from(data), {
        raw: {
          channels: (data.length / width / height) as Channels,
          width,
          height,
        },
      })
        .raw()
        .ensureAlpha()
        .png()
        .toBuffer()

      const backupResult = (await quircDecode(img))[0]

      if (backupResult && 'data' in backupResult) {
        debug(
          'found QR code with backup quirc in %s! data length=%d',
          position,
          backupResult.data.length
        )
        const data = maybeDecodeBase64(backupResult.data)

        return { data, position }
      }
    }
  }

  debug('detectQRCode: no QR code found')
  return undefined
}
