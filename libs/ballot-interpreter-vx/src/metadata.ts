import { decodeHmpbBallotPageMetadata } from '@votingworks/ballot-encoder';
import { Optional } from '@votingworks/basics';
import { BallotPageMetadata, ElectionDefinition } from '@votingworks/types';
import { Buffer } from 'buffer';

export class MetadataDecodeError extends Error {}

function tryBufferFromBase64(string: string): Optional<Buffer> {
  const buffer = Buffer.from(string, 'base64');
  return buffer.toString('base64') === string ? buffer : undefined;
}

function fromString(
  electionDefinition: ElectionDefinition,
  text: string
): BallotPageMetadata {
  const buffer = tryBufferFromBase64(text);
  if (!buffer) {
    throw new MetadataDecodeError('Metadata is not base64 encoded');
  }

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return fromBytes(electionDefinition, Buffer.from(text, 'base64'));
}

function fromBytes(
  electionDefinition: ElectionDefinition,
  data: Buffer
): BallotPageMetadata {
  if (data[0] === 'V'.charCodeAt(0) && data[1] === 'P'.charCodeAt(0)) {
    return decodeHmpbBallotPageMetadata(electionDefinition.election, data);
  }

  return fromString(electionDefinition, new TextDecoder().decode(data));
}

export function tryFromBytes(
  electionDefinition: ElectionDefinition,
  bytes: Buffer
): BallotPageMetadata | undefined {
  try {
    return fromBytes(electionDefinition, bytes);
  } catch {
    return undefined;
  }
}
