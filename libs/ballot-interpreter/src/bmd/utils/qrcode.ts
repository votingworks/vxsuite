import { detect as qrdetect } from '@votingworks/qrdetect';
import { decode as quircDecode, QRCode } from 'node-quirc';
import {
  detectRawBytesBmdBallot as detectMetadata,
  isVxBallot,
} from '@votingworks/ballot-encoder';
import { crop } from '@votingworks/image-utils';
import { Rect, Size } from '@votingworks/types';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { Optional, Result, err, ok, assertDefined } from '@votingworks/basics';
import { DetectedQrCode } from '../types';
import { stats, Stats } from './luminosity';

const LETTER_WIDTH_TO_HEIGHT_RATIO = 8.5 / 11;
const LEGAL_WIDTH_TO_HEIGHT_RATIO = 8.5 / 14;

const debug = makeDebug('ballot-interpreter:bmd:qrcode');

function isBase64(string: string): boolean {
  return Buffer.from(string, 'base64').toString('base64') === string;
}

function maybeDecodeBase64(data: Buffer): Buffer {
  try {
    if (detectMetadata(data)) {
      // BMD ballot, leave it
      return data;
    }

    const base64string = new TextDecoder().decode(data);

    if (!isBase64(base64string)) {
      // not base64, leave it
      return data;
    }
    const decodedData = Buffer.from(base64string, 'base64');
    return decodedData;
  } catch {
    return data;
  }
}

export function* getSearchAreas(
  size: Size
): Generator<{ position: 'top' | 'bottom'; bounds: Rect }> {
  const widthToHeightRatio = size.width / size.height;
  const isLetter =
    Math.abs(widthToHeightRatio - LETTER_WIDTH_TO_HEIGHT_RATIO) <
    Math.abs(widthToHeightRatio - LEGAL_WIDTH_TO_HEIGHT_RATIO);

  // If we're not letter size then the size of the scanned image may be too
  // large compared to the actual paper size. Instead of looking at the top
  // right and bottom left we look at the top right and bottom left, but with a
  // smaller area.
  if (!isLetter) {
    const expectedLetterHeight = Math.round(
      size.width / LETTER_WIDTH_TO_HEIGHT_RATIO
    );
    // QR code for BMD is top right, so appears top right or bottom left
    const bmdWidth = Math.round((size.width * 2) / 5);
    const bmdHeight = Math.round((expectedLetterHeight * 2) / 5);
    // We look at the bottom first because we're assuming people will mostly
    // scan sheets so they appear right-side up to them, but bottom-side first
    // to the scanner.

    // ┌───┐
    // │   │
    // ├─┐ │
    // │ │ │
    // └─┴─┘
    yield {
      position: 'bottom',
      bounds: {
        x: 0,
        y: size.height - bmdHeight,
        width: bmdWidth,
        height: bmdHeight,
      },
    };

    // ┌───┐
    // ├─┐ │
    // │ │ │
    // ├─┘ │
    // └───┘
    yield {
      position: 'bottom',
      bounds: {
        x: 0,
        y: expectedLetterHeight - bmdHeight,
        width: bmdWidth,
        height: bmdHeight,
      },
    };

    // ┌─┬─┐
    // │ │ │
    // │ └─┤
    // │   │
    // └───┘
    yield {
      position: 'top',
      bounds: {
        x: size.width - bmdWidth,
        y: 0,
        width: bmdWidth,
        height: bmdHeight,
      },
    };

    // ┌───┐
    // │ ┌─┤
    // │ │ │
    // │ └─┤
    // └───┘
    yield {
      position: 'top',
      bounds: {
        x: size.width - bmdWidth,
        y: size.height - expectedLetterHeight,
        width: bmdWidth,
        height: bmdHeight,
      },
    };
  }

  // QR code for BMD is top right, so appears top right or bottom left
  const bmdWidth = Math.round((size.width * 2) / 5);
  const bmdHeight = Math.round((size.height * 2) / 5);
  // We look at the bottom first because we're assuming people will mostly scan
  // sheets so they appear right-side up to them, but bottom-side first to the
  // scanner.

  // ┌───┐
  // │   │
  // ├─┐ │
  // └─┴─┘
  yield {
    position: 'bottom',
    bounds: {
      x: 0,
      y: size.height - bmdHeight,
      width: bmdWidth,
      height: bmdHeight,
    },
  };

  // ┌─┬─┐
  // │ └─┤
  // │   │
  // └───┘
  yield {
    position: 'top',
    bounds: {
      x: size.width - bmdWidth,
      y: 0,
      width: bmdWidth,
      height: bmdHeight,
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
        const results = await quircDecode(croppedImage);
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
        .map((result) => maybeDecodeBase64(result))
        .filter((result) => isVxBallot(result));

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
