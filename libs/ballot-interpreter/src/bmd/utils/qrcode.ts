import { detect as qrdetect } from '@votingworks/qrdetect';
import { decode as quircDecode, QRCode } from 'node-quirc';
import { isVxBallot } from '@votingworks/ballot-encoder';
import { ImageData, crop } from '@votingworks/image-utils';
import { Rect, Size } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import makeDebug from 'debug';
import { Optional, Result, err, ok, assertDefined } from '@votingworks/basics';
import { DetectedQrCode } from '../types';
import { stats, Stats } from './luminosity';

const debug = makeDebug('ballot-interpreter:bmd:qrcode');

/**
 * Decodes a base64 string from bytes representing a UTF-8 string. If either the
 * UTF-8 or base64 decoding fails, the original data is returned.
 */
function decodeBase64FromUtf8(utf8StringData: Buffer): Buffer {
  try {
    return Buffer.from(new TextDecoder().decode(utf8StringData), 'base64');
  } catch {
    /* istanbul ignore next */
    return utf8StringData;
  }
}

/**
 * We search for a QR code in the bottom and top "halves" of the BMDB image.
 *
 * The bottom search area is really the bottom 60% of the image. The extra 10% is to account for
 * the following situation:
 * - We're using VxCentralScan.
 * - We're configured to scan 22" HMPBs.
 * - The BMDB is inserted into the scanner right side up, which results in an upside down image.
 *
 * Because neither the Fujitsu scanner nor the BMDB interpreter crops images, we end up with a BMDB
 * image where the BMDB is oriented upside down and there's a large empty space at the bottom of
 * the image, like this:
 * ```
 * +--------------------+
 * |                    |
 * | BMDB, upside down  |
 * |                    |
 * | [QR]               |
 * |--------------------|
 * | Empty space        |
 * |                    |
 * +--------------------+
 * ```
 *
 * The QR code ends up right in the middle of the image and is missed if you search exact halves.
 * To address this case, we expand the bottom search area and also intentionally search in that half
 * first, since we rotate the image when we detect a QR code in the bottom half, which we do want
 * to do in this case. If we were to expand the top search area and search in that half first, we'd
 * still catch the QR code but miss that we need to rotate the image.
 *
 * While this logic is optimized for this specific case, it works for all other HMPB sizes and BMDB
 * orientations as well.
 *
 * TODO(https://github.com/votingworks/vxsuite/issues/4980): Be more selective about BMDB QR code
 * search areas after merging HMPB and BMDB interpretation and ensuring that images are properly
 * cropped in all cases.
 */
export function* getSearchAreas(
  size: Size
): Generator<{ position: 'top' | 'bottom'; bounds: Rect }> {
  // Use Math.floor instead of Math.round to prevent search areas from accidentally extending
  // beyond the image
  const heightMidpoint = Math.floor(size.height / 2);
  yield {
    position: 'bottom',
    bounds: {
      x: 0,
      y: heightMidpoint - Math.floor(size.height * 0.1),
      width: size.width,
      height: heightMidpoint + Math.floor(size.height * 0.1),
    },
  };
  yield {
    position: 'top',
    bounds: {
      x: 0,
      y: 0,
      width: size.width,
      height: heightMidpoint,
    },
  };
}

/**
 * Detects QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<Optional<DetectedQrCode>> {
  debug('detect: checking %dˣ%d image', imageData.width, imageData.height);

  const detectors = [
    {
      name: 'qrdetect',
      detect: ({ data, width, height }: ImageData): Buffer[] =>
        qrdetect(data, width, height).map((symbol) => symbol.data),
    },
    {
      name: 'quirc',
      detect: async (croppedImage: ImageData): Promise<Buffer[]> => {
        const results = await quircDecode(croppedImage as globalThis.ImageData);
        return results
          .filter((result): result is QRCode => !('err' in result))
          .map((result) => result.data);
      },
    },
  ];

  for (const detector of detectors) {
    for (const { position, bounds } of getSearchAreas(imageData)) {
      debug('cropping %s to check for QR code: %o', position, bounds);
      const cropped = crop(imageData, bounds);
      debug('scanning with %s', detector.name);
      const results = await detector.detect(cropped);

      if (results.length === 0) {
        debug('%s found no raw QR codes in %s', detector.name, position);
        continue;
      }

      debug(
        '%s found pre-filtered QR code in %s! data length=%d',
        detector.name,
        position,
        results[0]?.length
      );

      // Sometimes, our QR code detectors hallucinate and see QR codes in the noise
      // We filter the QR codes down to the ones that look like Vx ballot data.
      const recognizedResults = results
        .map(decodeBase64FromUtf8)
        .filter(isVxBallot);

      if (recognizedResults.length === 0) {
        debug('%s no recognized QR codes in %s', detector.name, position);
        continue;
      }

      debug(
        '%s found QR code in %s! data length=%d',
        detector.name,
        position,
        recognizedResults[0]?.length
      );

      return {
        data: assertDefined(recognizedResults[0]),
        position,
        detector: detector.name,
      };
    }
  }

  return undefined;
}

const MINIMUM_BACKGROUND_COLOR_THRESHOLD = 200;
const MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO = 0.007;

export interface BallotPageQrcode {
  data: Uint8Array;
  position: 'top' | 'bottom';
}

export type DetectQrCodeError = { type: 'blank-page' } | { type: 'no-qr-code' };
export type QrCodePageResult = Result<DetectedQrCode, DetectQrCodeError>;

export async function detectInBallot(
  imageData: ImageData
): Promise<QrCodePageResult> {
  let foundDarkRegion = false;
  let darkestRegionStats: Stats | undefined;
  let darkestRegion: Rect | undefined;

  for (const { position, bounds } of getSearchAreas({
    width: imageData.width,
    height: imageData.height,
  })) {
    const regionStats = stats(imageData, {
      threshold: MINIMUM_BACKGROUND_COLOR_THRESHOLD,
      bounds,
    });

    if (
      !darkestRegionStats ||
      regionStats.foreground.ratio > darkestRegionStats.foreground.ratio
    ) {
      darkestRegionStats = regionStats;
      darkestRegion = bounds;
    }

    if (
      regionStats.foreground.ratio > MAXIMUM_BLANK_PAGE_FOREGROUND_PIXEL_RATIO
    ) {
      debug(
        'found dark region in %s QR code search area (%o): %O',
        position,
        bounds,
        regionStats
      );
      foundDarkRegion = true;
      break;
    }
  }

  if (!foundDarkRegion) {
    debug(
      'appears to be a blank page, skipping. darkest region: %o stats=%O',
      darkestRegion,
      darkestRegionStats
    );
    return err({ type: 'blank-page' });
  }

  const qrcode = await detect(imageData);

  if (!qrcode) {
    return err({ type: 'no-qr-code' });
  }

  return ok(qrcode);
}
