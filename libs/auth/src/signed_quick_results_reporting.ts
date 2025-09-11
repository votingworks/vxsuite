import { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  ElectionDefinition,
  Tabulation,
  CompressedTally,
  CompressedTallyEntry,
  safeParseInt,
} from '@votingworks/types';
import { assert, err, ok, Result } from '@votingworks/basics';
import { compressTally } from '@votingworks/utils';
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
}

const CERT_PEM_HEADER = '-----BEGIN CERTIFICATE-----';
const CERT_PEM_FOOTER = '-----END CERTIFICATE-----';

/**
 * The separator between parts of the signed quick results reporting message payload.
 * Using a null byte (0x00) as it's guaranteed to not appear in base64url encoded data
 * and provides a safe delimiter for URL-safe payloads.
 */
const SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR = '\x00';

const QR_MESSAGE_FORMAT = 'qr1';

/**
 * Encodes a compressed tally for inclusion in a QR code URL.
 * Uses a more efficient encoding than JSON + base64.
 */
function encodeCompressedTally(compressedTally: CompressedTally): string {
  // Convert the compressed tally (array of arrays of numbers) to a more compact format
  // by flattening and using length prefixes for each contest's data
  const flatData: number[] = [];

  for (const contestTally of compressedTally) {
    // Add length prefix for this contest's data
    flatData.push(contestTally.length);
    // Add the actual tally data
    flatData.push(...contestTally);
  }

  // Convert to Uint32Array for efficient binary encoding
  const uint32Array = new Uint32Array(flatData);
  // Convert to buffer and then to base64url (URL-safe, no padding)
  const buffer = Buffer.from(uint32Array.buffer);
  return buffer.toString('base64url');
}

/**
 * Decodes a compressed tally from QR code URL data.
 * Reverses the encoding performed by encodeCompressedTally.
 */
function decodeCompressedTally(encodedData: string): CompressedTally {
  // Decode from base64url back to buffer
  const buffer = Buffer.from(encodedData, 'base64url');
  // Convert to Uint32Array
  const uint32Array = new Uint32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 4
  );

  // Reconstruct the compressed tally structure
  const compressedTally: CompressedTally = [];
  let index = 0;

  while (index < uint32Array.length) {
    const contestLength = uint32Array[index];
    index += 1;
    if (contestLength === undefined) break;

    const contestTally: number[] = [];
    for (let i = 0; i < contestLength; i += 1) {
      const value = uint32Array[index];
      index += 1;
      if (value === undefined) throw new Error('Invalid encoded tally data');
      contestTally.push(value);
    }
    compressedTally.push(contestTally as CompressedTallyEntry);
  }

  return compressedTally;
}

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
export function encodeMessagePayload(components: {
  ballotHash: string;
  signingMachineId: string;
  isLiveMode: boolean;
  timestamp: number;
  compressedTally: CompressedTally;
}): string {
  const messagePayloadParts = [
    safeEncodeForUrl(components.ballotHash),
    safeEncodeForUrl(components.signingMachineId),
    components.isLiveMode ? '1' : '0',
    components.timestamp.toString(),
    encodeCompressedTally(components.compressedTally),
  ];

  return messagePayloadParts.join(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );
}

/**
 * Decodes a message payload string back into its components.
 * Exported for testing purposes.
 */
export function decodeQrCodeMessage(payload: string): {
  ballotHash: string;
  machineId: string;
  isLive: boolean;
  signedTimestamp: Date;
  compressedTally: CompressedTally;
} {
  const { messageType, messagePayload } = deconstructPrefixedMessage(payload);

  assert(messageType === QR_MESSAGE_FORMAT);

  const parts = messagePayload.split(
    SIGNED_QUICK_RESULTS_REPORTING_MESSAGE_PAYLOAD_SEPARATOR
  );

  if (parts.length !== 5) {
    throw new Error('Invalid message payload format');
  }

  const [
    ballotHashEncoded,
    signingMachineIdEncoded,
    isLiveModeStr,
    timestampStr,
    compressedTallyEncoded,
  ] = parts;

  if (
    !ballotHashEncoded ||
    !signingMachineIdEncoded ||
    !isLiveModeStr ||
    !timestampStr ||
    !compressedTallyEncoded
  ) {
    throw new Error('Missing required message payload components');
  }

  const timestampResult = safeParseInt(timestampStr);
  if (timestampResult.isErr()) {
    throw new Error('Invalid timestamp format');
  }
  const timestampNumber = timestampResult.ok();

  return {
    ballotHash: safeDecodeFromUrl(ballotHashEncoded),
    machineId: safeDecodeFromUrl(signingMachineIdEncoded),
    isLive: isLiveModeStr === '1',
    signedTimestamp: new Date(timestampNumber * 1000),
    compressedTally: decodeCompressedTally(compressedTallyEncoded),
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
  }: SignedQuickResultsReportingInput,
  configOverride?: SignedQuickResultsReportingConfig
): Promise<string> {
  const config =
    configOverride ??
    /* istanbul ignore next - @preserve */ constructSignedQuickResultsReportingConfig();

  const { ballotHash, election } = electionDefinition;
  const compressedTally = compressTally(election, results);
  const secondsSince1970 = Math.round(new Date().getTime() / 1000);

  const messagePayload = encodeMessagePayload({
    ballotHash,
    signingMachineId,
    isLiveMode,
    timestamp: secondsSince1970,
    compressedTally,
  });
  const message = constructPrefixedMessage(QR_MESSAGE_FORMAT, messagePayload);
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

  const signedQuickResultsReportingUrl = `${quickResultsReportingUrl}?p=${encodeURIComponent(
    message
  )}&s=${messageSignature.toString('base64url')}&c=${encodeURIComponent(
    machineCertContent
  )}`;
  return signedQuickResultsReportingUrl;
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
