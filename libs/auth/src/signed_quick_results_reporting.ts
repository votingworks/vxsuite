import { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  Election,
  ElectionDefinition,
  LIVE_REPORT_VOTING_TYPES,
  LiveReportVotingType,
  PollsTransitionType,
  PrecinctId,
  Tabulation,
  safeParseInt,
} from '@votingworks/types';
import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  encodePrecinctBitmap,
  encodeTallyEntries,
  getPrecinctIdsFromBitmap,
} from '@votingworks/utils';
import {
  constructPrefixedMessage,
  deconstructPrefixedMessage,
} from './signatures';
import {
  extractPublicKeyFromCert,
  signMessage,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './cryptography';
import {
  constructSignedQuickResultsReportingConfig,
  getVxCertAuthorityCertPath,
  SignedQuickResultsReportingConfig,
} from './config';
import { parseCert } from './certs';

interface SignedQuickResultsReportingInput {
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  quickResultsReportingUrl: string;
  ballotCount: number;
  resultsByPrecinct: Partial<Record<string, Tabulation.ElectionResults>>;
  signingMachineId: string;
  pollsTransitionType: PollsTransitionType;
  votingType: LiveReportVotingType;
  pollsTransitionTimestamp: number;
  maxQrCodeLength?: number; // Provided as a prop for ease in testing
}

/**
 * Non-tally primaryMessage values (both new transition types and old polls
 * state strings for backwards compatibility).
 */
const NON_TALLY_PRIMARY_MESSAGES = [
  'open_polls',
  'pause_voting',
  'resume_voting',
  'polls_open',
  'polls_paused',
] as const;

/**
 * Maps old polls-state-based primaryMessage strings to transition types for
 * backwards compatibility with older QR messages.
 */
export function normalizePollsTransitionType(
  primaryMessage: string
): PollsTransitionType {
  switch (primaryMessage) {
    case 'polls_open':
      return 'open_polls';
    case 'polls_paused':
      return 'pause_voting';
    default:
      return primaryMessage as PollsTransitionType;
  }
}

const MAXIMUM_BYTES_IN_MEDIUM_QR_CODE = 2300;
const MAX_PARTS_FOR_QR_CODE = 25;

const CERT_PEM_HEADER = '-----BEGIN CERTIFICATE-----';
const CERT_PEM_FOOTER = '-----END CERTIFICATE-----';

/**
 * The separator between parts of the signed quick results reporting message payload.
 * Using a null byte (0x00) as it's guaranteed to not appear in base64url encoded data
 * and provides a safe delimiter for URL-safe payloads.
 */
const SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR = '\x00';

/**
 * The v1 message format (8 fields, no ballot count or voting type).
 */
export const QR_MESSAGE_FORMAT_V1 = 'qr1';

/**
 * The current message format (10 fields: base fields with bitmap in field 5,
 * ballot count, and voting type).
 */
export const QR_MESSAGE_FORMAT = 'qr2';

/**
 * Safely encodes a string for use in URLs by URL-encoding any characters that
 * could conflict with our message separator or URL structure.
 */
function safeEncodeForUrl(input: string): string {
  return encodeURIComponent(input);
}

/**
 * Decodes a URL-encoded string back to its original form.
 */
function safeDecodeFromUrl(encoded: string): string {
  return decodeURIComponent(encoded);
}

/**
 * Encodes the message payload components into a single string.
 * Exported for testing purposes.
 */
export function encodeQuickResultsMessage(components: {
  ballotHash: string;
  signingMachineId: string;
  isLiveMode: boolean;
  timestamp: number;
  // primaryMessage is either a compressed tally (base64) or a transition type string
  primaryMessage: string;
  encodedPrecinctBitmap: string;
  numPages: number;
  pageIndex: number;
  ballotCount: number;
  votingType: LiveReportVotingType;
}): string {
  const messagePayloadParts = [
    safeEncodeForUrl(components.ballotHash),
    safeEncodeForUrl(components.signingMachineId),
    components.isLiveMode ? '1' : '0',
    components.timestamp.toString(),
    components.primaryMessage,
    components.encodedPrecinctBitmap,
    components.numPages.toString(),
    components.pageIndex.toString(),
    components.ballotCount.toString(),
    LIVE_REPORT_VOTING_TYPES.indexOf(components.votingType).toString(),
  ];

  return messagePayloadParts.join(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );
}

interface DecodedBaseFields {
  ballotHash: string;
  machineId: string;
  isLive: boolean;
  reportCreatedAt?: Date;
  encodedCompressedTally: string;
  precinctIds: PrecinctId[];
  pollsTransitionType: PollsTransitionType;
  numPages: number;
  pageIndex: number;
}

interface DecodedFields extends DecodedBaseFields {
  pollsTransitionTime?: Date;
  ballotCount?: number;
  votingType: LiveReportVotingType;
}

function parseRequiredInt(value: string, fieldName: string): number {
  const result = safeParseInt(value);
  if (result.isErr()) {
    throw new Error(`Invalid ${fieldName} format`);
  }
  return result.ok();
}

function decodeBaseFields(
  parts: string[]
): DecodedBaseFields & { timestamp: Date } {
  const [
    ballotHashEncoded,
    signingMachineIdEncoded,
    isLiveModeStr,
    timestampStr,
    primaryMessage,
    precinctId,
    numPagesStr,
    pageIndexStr,
  ] = parts;

  if (
    !ballotHashEncoded ||
    !signingMachineIdEncoded ||
    !isLiveModeStr ||
    !timestampStr ||
    !primaryMessage ||
    !numPagesStr ||
    pageIndexStr === undefined
  ) {
    throw new Error('Missing required message payload components');
  }

  const timestampNumber = parseRequiredInt(timestampStr, 'timestamp');

  const numPages = parseRequiredInt(numPagesStr, 'number of pages');
  if (numPages < 1) {
    throw new Error('Invalid number of pages format');
  }

  const pageIndex = parseRequiredInt(pageIndexStr, 'page index');
  if (pageIndex < 0) {
    throw new Error('Invalid page index format');
  }

  const isNonTallyMessage = (
    NON_TALLY_PRIMARY_MESSAGES as readonly string[]
  ).includes(primaryMessage);
  const pollsTransitionType = isNonTallyMessage
    ? normalizePollsTransitionType(primaryMessage)
    : 'close_polls';

  return {
    ballotHash: safeDecodeFromUrl(ballotHashEncoded),
    machineId: safeDecodeFromUrl(signingMachineIdEncoded),
    isLive: isLiveModeStr === '1',
    timestamp: new Date(timestampNumber * 1000),
    encodedCompressedTally: isNonTallyMessage ? '' : primaryMessage,
    precinctIds: [],
    pollsTransitionType,
    numPages,
    pageIndex,
  };
}

function decodeV1Message(messagePayload: string): DecodedFields {
  const parts = messagePayload.split(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );
  if (parts.length !== 8) {
    throw new Error('Invalid message payload format');
  }
  const { timestamp, ...base } = decodeBaseFields(parts);
  const precinctField = parts[5] ?? '';
  const precinctIds: PrecinctId[] = precinctField
    ? [safeDecodeFromUrl(precinctField)]
    : [];
  return {
    ...base,
    precinctIds,
    reportCreatedAt: timestamp,
    ballotCount: undefined,
    votingType: 'election_day',
  };
}

function decodeV2Message(
  messagePayload: string,
  election: Election
): DecodedFields {
  const parts = messagePayload.split(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );
  if (parts.length !== 10) {
    throw new Error('Invalid message payload format');
  }

  const { timestamp, ...base } = decodeBaseFields(parts);

  const ballotCountStr = parts[8];
  assert(ballotCountStr !== undefined);
  const ballotCount = parseRequiredInt(ballotCountStr, 'ballot count');
  if (ballotCount < 0) {
    throw new Error('Invalid ballot count format');
  }

  const votingTypeDigitStr = parts[9];
  assert(votingTypeDigitStr !== undefined);
  const votingTypeDigit = parseRequiredInt(votingTypeDigitStr, 'voting type');
  const votingType = LIVE_REPORT_VOTING_TYPES[votingTypeDigit];
  if (!votingType) {
    throw new Error('Invalid voting type format');
  }

  // Field 5 is always a precinct bitmap in v2.
  const encodedBitmap = parts[5] ?? '';
  const precinctIds = encodedBitmap
    ? getPrecinctIdsFromBitmap(election, encodedBitmap)
    : [];

  return {
    ...base,
    precinctIds,
    pollsTransitionTime: timestamp,
    ballotCount,
    votingType,
  };
}

/**
 * Extracts just the ballot hash from a signed quick results reporting payload
 * without performing full decoding. Useful for looking up the election before
 * performing the full decode.
 */
export function extractBallotHashFromPayload(payload: string): string {
  const { messagePayload } = deconstructPrefixedMessage(payload);
  const firstField = messagePayload.split(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  )[0];
  assert(firstField !== undefined, 'Missing ballot hash in payload');
  return decodeURIComponent(firstField);
}

/**
 * Decodes a message payload string back into its components.
 * Exported for testing purposes.
 */
export function decodeQuickResultsMessage(
  payload: string,
  election: Election
): DecodedFields {
  const { messageType, messagePayload } = deconstructPrefixedMessage(payload);

  switch (messageType) {
    case QR_MESSAGE_FORMAT_V1:
      return decodeV1Message(messagePayload);
    case QR_MESSAGE_FORMAT:
      return decodeV2Message(messagePayload, election);
    default:
      throw new Error(`Unknown QR message format: ${messageType}`);
  }
}

// Shared helper: sign a message, read machine cert, and build the final URL.
async function signAndBuildUrl(
  message: string,
  config: SignedQuickResultsReportingConfig,
  quickResultsReportingUrl: string,
  maxQrCodeLength: number
): Promise<string | null> {
  const messageSignature = await signMessage({
    message: Readable.from(message),
    signingPrivateKey: config.machinePrivateKey,
  });

  const machineCert = await fs.readFile(config.machineCertPath);
  const certDetails = await parseCert(machineCert);
  assert(certDetails.component !== 'card');

  // Extract the certificate content, decode from PEM base64 to binary DER, then encode as base64url
  const machineCertContent = machineCert
    .toString('utf-8')
    // Remove the standard PEM header and footer to get the base64 content
    .replace(CERT_PEM_HEADER, '')
    .replace(CERT_PEM_FOOTER, '');

  const params = new URLSearchParams({
    p: message,
    s: messageSignature.toString('base64url'),
    c: machineCertContent,
  });
  const signedQuickResultsReportingUrl = `${quickResultsReportingUrl}?${params.toString()}`;
  if (
    Buffer.byteLength(signedQuickResultsReportingUrl, 'utf-8') > maxQrCodeLength
  ) {
    return null;
  }
  return signedQuickResultsReportingUrl;
}

/**
 * Returns the URL to encode as a QR code for quick results reporting, including a signed payload
 * containing the election results
 */
export async function generateSignedQuickResultsReportingUrl(
  {
    electionDefinition,
    isLiveMode,
    quickResultsReportingUrl,
    ballotCount,
    resultsByPrecinct,
    signingMachineId,
    pollsTransitionType,
    votingType,
    pollsTransitionTimestamp,
    maxQrCodeLength = MAXIMUM_BYTES_IN_MEDIUM_QR_CODE,
  }: SignedQuickResultsReportingInput,
  configOverride?: SignedQuickResultsReportingConfig
): Promise<string[]> {
  const config =
    configOverride ??
    /* istanbul ignore next - @preserve */ constructSignedQuickResultsReportingConfig();

  const { ballotHash, election } = electionDefinition;
  let numPagesNeeded = 1; // If we need to paginate this value will be incremented.
  const secondsSince1970 = Math.round(pollsTransitionTimestamp / 1000);

  // Compute the precinct bitmap once for all transition types
  const encodedPrecinctBitmap = encodePrecinctBitmap(
    election,
    resultsByPrecinct
  );

  switch (pollsTransitionType) {
    case 'close_polls': {
      // Try increasing pagination until all parts fit within the QR size limits.
      while (numPagesNeeded <= MAX_PARTS_FOR_QR_CODE) {
        const encodedUrls: string[] = [];
        const tallyPages = encodeTallyEntries({
          election,
          resultsByPrecinct,
          numPages: numPagesNeeded,
        });
        for (const tallyPage of tallyPages) {
          const messagePayload = encodeQuickResultsMessage({
            ballotHash,
            signingMachineId,
            isLiveMode,
            timestamp: secondsSince1970,
            primaryMessage: tallyPage,
            encodedPrecinctBitmap,
            numPages: numPagesNeeded,
            pageIndex: encodedUrls.length,
            ballotCount,
            votingType,
          });
          const message = constructPrefixedMessage(
            QR_MESSAGE_FORMAT,
            messagePayload
          );
          const url = await signAndBuildUrl(
            message,
            config,
            quickResultsReportingUrl,
            maxQrCodeLength
          );
          if (!url) break;
          encodedUrls.push(url);
        }

        if (encodedUrls.length !== tallyPages.length) {
          numPagesNeeded += 1;
          continue;
        }
        return encodedUrls;
      }
      break;
    }
    case 'open_polls':
    case 'pause_voting':
    case 'resume_voting': {
      // For non-close-polls reports we don't send tally data, just the
      // ballot count so the confirmation page can display it.
      const messagePayload = encodeQuickResultsMessage({
        ballotHash,
        signingMachineId,
        isLiveMode,
        timestamp: secondsSince1970,
        primaryMessage: pollsTransitionType,
        encodedPrecinctBitmap,
        numPages: 1,
        pageIndex: 0,
        ballotCount,
        votingType,
      });
      const message = constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        messagePayload
      );
      const url = await signAndBuildUrl(
        message,
        config,
        quickResultsReportingUrl,
        maxQrCodeLength
      );
      /* istanbul ignore next - @preserve */
      if (!url) break;
      return [url];
    }
    /* istanbul ignore next - @preserve */
    default: {
      throwIllegalValue(pollsTransitionType);
    }
  }
  throw new Error(
    `Unable to fit signed quick results reporting URL within ${maxQrCodeLength} bytes broken up over ${MAX_PARTS_FOR_QR_CODE} parts`
  );
}

/**
 * Verifies that the provided signature is valid for the given payload and was signed by the key that the public certificate is for.
 * Additionally verifies that the certificate why signed by the trusted certificate authority.
 * If any error occurs during verification, 'invalid-signature' is returned.
 * Otherwise, void is returned to indicate success.
 */
export async function authenticateSignedQuickResultsReportingUrl(
  payload: string,
  signature: string,
  rawCertificate: string,
  caCertPath?: string
): Promise<Result<void, 'invalid-signature'>> {
  // Verify the signature and certificate
  // Convert base64url back to binary DER, then to PEM format
  const certificateDer = Buffer.from(rawCertificate, 'base64url');
  const certificateBase64 = certificateDer.toString('base64');
  const certificate = Buffer.from(
    `${CERT_PEM_HEADER}\n${certificateBase64}\n${CERT_PEM_FOOTER}`
  );

  const cacPath =
    caCertPath ??
    /* istanbul ignore next - @preserve */ getVxCertAuthorityCertPath();

  try {
    const publicKey = await extractPublicKeyFromCert(Buffer.from(certificate));
    await verifyFirstCertWasSignedBySecondCert(certificate, cacPath);
    await verifySignature({
      message: Buffer.from(payload),
      messageSignature: Buffer.from(signature, 'base64url'),
      publicKey,
    });
  } catch (e) {
    return err('invalid-signature');
  }

  return ok();
}
