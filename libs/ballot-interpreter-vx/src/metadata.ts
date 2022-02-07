import { decodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import {
  BallotLocales,
  BallotPageMetadata,
  BallotType,
  Election,
} from '@votingworks/types';
import { DetectQrCode } from './types';
import { defined } from './utils/defined';
import * as qrcode from './utils/qrcode';

export interface DetectOptions {
  detectQrCode?: DetectQrCode;
}

export interface DetectResult {
  metadata: BallotPageMetadata;
  flipped: boolean;
}

export class MetadataDecodeError extends Error {}

export function decodeSearchParams(
  searchParams: URLSearchParams
): BallotPageMetadata {
  const type = defined(searchParams.get('t'));
  const precinctId = defined(searchParams.get('pr'));
  const ballotStyleId = defined(searchParams.get('bs'));
  const pageInfo = defined(searchParams.get('p'));

  const primaryLocaleCode = searchParams.get('l1') ?? undefined;
  const secondaryLocaleCode = searchParams.get('l2') ?? undefined;
  let locales: BallotLocales | undefined;

  if (primaryLocaleCode) {
    if (secondaryLocaleCode) {
      locales = { primary: primaryLocaleCode, secondary: secondaryLocaleCode };
    } else {
      locales = { primary: primaryLocaleCode };
    }
  } else {
    locales = { primary: 'en-US' };
  }

  const [typeTestMode] = type.split('', 2);
  const [pageInfoNumber] = pageInfo.split('-', 2);
  const isTestMode = typeTestMode === 't';
  // eslint-disable-next-line vx/gts-safe-number-parse
  const pageNumber = parseInt(pageInfoNumber, 10);

  return {
    electionHash: '',
    ballotType: BallotType.Standard,
    locales,
    ballotStyleId,
    precinctId,
    isTestMode,
    pageNumber,
  };
}

function isBase64(string: string): boolean {
  return Buffer.from(string, 'base64').toString('base64') === string;
}

export function fromString(
  election: Election,
  text: string
): BallotPageMetadata {
  if (isBase64(text)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return fromBytes(election, Buffer.from(text, 'base64'));
  }
  return decodeSearchParams(new URL(text).searchParams);
}

export function fromBytes(
  election: Election,
  data: Buffer
): BallotPageMetadata {
  if (data[0] === 'V'.charCodeAt(0) && data[1] === 'P'.charCodeAt(0)) {
    return decodeHmpbBallotPageMetadata(election, data);
  }

  return fromString(election, new TextDecoder().decode(data));
}

export async function detect(
  election: Election,
  imageData: ImageData,
  { detectQrCode = qrcode.detect }: DetectOptions = {}
): Promise<DetectResult> {
  const result = await detectQrCode(imageData);

  if (!result) {
    throw new MetadataDecodeError('Expected QR code not found.');
  }

  return {
    metadata: fromBytes(election, result.data),
    flipped: result.rightSideUp === false,
  };
}
