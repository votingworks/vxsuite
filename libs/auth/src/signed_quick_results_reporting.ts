import { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  ElectionDefinition,
  PollsStateSupportsLiveReporting,
  PrecinctSelection,
  Tabulation,
  safeParseInt,
} from '@votingworks/types';
import { assert, err, ok, Result } from '@votingworks/basics';
import {
  ALL_PRECINCTS_SELECTION,
  compressAndEncodeTally,
  singlePrecinctSelectionFor,
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
  results: Tabulation.ElectionResults;
  signingMachineId: string;
  precinctSelection: PrecinctSelection;
  pollsState: PollsStateSupportsLiveReporting;
  maxQrCodeLength?: number; // Provided as a prop for ease in testing
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
 * The message format identifier for signed quick results reporting QR codes.
 */
export const QR_MESSAGE_FORMAT = 'qr1';

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
  compressedTally: string;
  precinctSelection: PrecinctSelection;
  pollsState: PollsStateSupportsLiveReporting;
  numPages: number;
  pageIndex: number;
}): string {
  const messagePayloadParts = [
    safeEncodeForUrl(components.ballotHash),
    safeEncodeForUrl(components.signingMachineId),
    components.isLiveMode ? '1' : '0',
    components.timestamp.toString(),
    // When polls are closed we send results, otherwise we can reuse this field for the poll state.
    components.compressedTally === ''
      ? components.pollsState
      : components.compressedTally,
    components.precinctSelection.kind === 'SinglePrecinct'
      ? safeEncodeForUrl(components.precinctSelection.precinctId)
      : '',
    components.numPages.toString(),
    components.pageIndex.toString(),
  ];

  return messagePayloadParts.join(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );
}

/**
 * Decodes a message payload string back into its components.
 * Exported for testing purposes.
 */
export function decodeQuickResultsMessage(payload: string): {
  ballotHash: string;
  machineId: string;
  isLive: boolean;
  signedTimestamp: Date;
  encodedCompressedTally: string;
  precinctSelection: PrecinctSelection;
  pollsState: PollsStateSupportsLiveReporting;
  numPages: number;
  pageIndex: number;
} {
  const { messageType, messagePayload } = deconstructPrefixedMessage(payload);

  assert(messageType === QR_MESSAGE_FORMAT);

  const parts = messagePayload.split(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );

  if (parts.length !== 8) {
    throw new Error('Invalid message payload format');
  }

  const [
    ballotHashEncoded,
    signingMachineIdEncoded,
    isLiveModeStr,
    timestampStr,
    encodedCompressedTally,
    precinctId,
    numPagesStr,
    pageIndexStr,
  ] = parts;

  if (
    !ballotHashEncoded ||
    !signingMachineIdEncoded ||
    !isLiveModeStr ||
    !timestampStr ||
    !encodedCompressedTally ||
    !numPagesStr ||
    pageIndexStr === undefined
  ) {
    throw new Error('Missing required message payload components');
  }

  const timestampResult = safeParseInt(timestampStr);
  if (timestampResult.isErr()) {
    throw new Error('Invalid timestamp format');
  }
  const timestampNumber = timestampResult.ok();

  const numPagesResult = safeParseInt(numPagesStr);
  if (numPagesResult.isErr() || numPagesResult.ok() < 1) {
    throw new Error('Invalid number of pages format');
  }
  const numPages = numPagesResult.ok();

  const pageIndexResult = safeParseInt(pageIndexStr);
  if (pageIndexResult.isErr() || pageIndexResult.ok() < 0) {
    throw new Error('Invalid page index format');
  }
  const pageIndex = pageIndexResult.ok();

  // If the tally is a tally it will be base64 encoded, otherwise it will be a plaintext string with the poll state.
  const pollsState =
    encodedCompressedTally === 'polls_open'
      ? 'polls_open'
      : 'polls_closed_final';

  return {
    ballotHash: safeDecodeFromUrl(ballotHashEncoded),
    machineId: safeDecodeFromUrl(signingMachineIdEncoded),
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(safeDecodeFromUrl(precinctId))
      : ALL_PRECINCTS_SELECTION,
    isLive: isLiveModeStr === '1',
    signedTimestamp: new Date(timestampNumber * 1000),
    encodedCompressedTally:
      pollsState === 'polls_open' ? '' : encodedCompressedTally,
    pollsState,
    numPages,
    pageIndex,
  };
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
    results,
    signingMachineId,
    precinctSelection,
    pollsState,
    maxQrCodeLength = MAXIMUM_BYTES_IN_MEDIUM_QR_CODE,
  }: SignedQuickResultsReportingInput,
  configOverride?: SignedQuickResultsReportingConfig
): Promise<string[]> {
  const config =
    configOverride ??
    /* istanbul ignore next - @preserve */ constructSignedQuickResultsReportingConfig();

  const { ballotHash, election } = electionDefinition;
  let numPagesNeeded = 1; // If we need to paginate this value will be incremented.
  const secondsSince1970 = Math.round(new Date().getTime() / 1000);

  while (
    numPagesNeeded <=
    // Only paginate if polls are closed and we have results to send.
    (pollsState === 'polls_closed_final' ? MAX_PARTS_FOR_QR_CODE : 1)
  ) {
    const compressedTallies =
      pollsState === 'polls_closed_final'
        ? compressAndEncodeTally({
            election,
            results,
            precinctSelection,
            numPages: numPagesNeeded,
          })
        : ['']; // For polls open reports we don't have results to send.
    const encodedUrls: string[] = [];
    for (const compressedTally of compressedTallies) {
      const messagePayload = encodeQuickResultsMessage({
        ballotHash,
        signingMachineId,
        isLiveMode,
        timestamp: secondsSince1970,
        compressedTally,
        pollsState,
        precinctSelection,
        numPages: numPagesNeeded,
        pageIndex: encodedUrls.length,
      });
      const message = constructPrefixedMessage(
        QR_MESSAGE_FORMAT,
        messagePayload
      );
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
        Buffer.byteLength(signedQuickResultsReportingUrl, 'utf-8') >
        maxQrCodeLength
      ) {
        break;
      }
      encodedUrls.push(signedQuickResultsReportingUrl);
    }

    if (encodedUrls.length !== compressedTallies.length) {
      numPagesNeeded += 1;
      continue;
    }
    return encodedUrls;
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
