import { decodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import {
  BallotLocales,
  BallotPageMetadata,
  BallotType,
  ElectionDefinition,
} from '@votingworks/types';
import { defined } from './utils/defined';
import { detect as detectQrCode } from './utils/qrcode';

export interface DetectResult {
  metadata: BallotPageMetadata;
  flipped: boolean;
}

export class MetadataDecodeError extends Error {}

export function decodeSearchParams(
  electionDefinition: ElectionDefinition,
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
    electionHash: electionDefinition.electionHash,
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
  electionDefinition: ElectionDefinition,
  text: string
): BallotPageMetadata {
  if (isBase64(text)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return fromBytes(electionDefinition, Buffer.from(text, 'base64'));
  }
  return decodeSearchParams(electionDefinition, new URL(text).searchParams);
}

export function fromBytes(
  electionDefinition: ElectionDefinition,
  data: Buffer
): BallotPageMetadata {
  if (data[0] === 'V'.charCodeAt(0) && data[1] === 'P'.charCodeAt(0)) {
    return decodeHmpbBallotPageMetadata(electionDefinition.election, data);
  }

  return fromString(electionDefinition, new TextDecoder().decode(data));
}

export async function detect(
  electionDefinition: ElectionDefinition,
  imageData: ImageData
): Promise<DetectResult> {
  const result = await detectQrCode(imageData);

  if (!result) {
    throw new MetadataDecodeError('Expected QR code not found.');
  }

  return {
    metadata: fromBytes(electionDefinition, result.data),
    flipped: result.position === 'top',
  };
}
