import { BallotMode } from '@votingworks/hmpb';
import { BallotStyleId, BallotType } from '@votingworks/types';
import { customAlphabet } from 'nanoid';

export function getPdfFileName(
  precinctName: string,
  ballotStyleId: BallotStyleId,
  ballotType: BallotType,
  ballotMode: BallotMode
): string {
  return `${ballotMode}-${ballotType}-ballot-${precinctName.replaceAll(
    ' ',
    '_'
  )}-${ballotStyleId}.pdf`;
}

const idGenerator = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generates a URL-friendly and double-click-copy-friendly unique ID using a
 * cryptographically secure RNG.
 */
export function generateId(): string {
  return idGenerator();
}
