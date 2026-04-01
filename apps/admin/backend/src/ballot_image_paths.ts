import { assert } from '@votingworks/basics';
import { Side } from '@votingworks/types';
import { join, sep } from 'node:path';

/**
 * Returns the ballot image path relative to the ballot images root directory.
 */
export function getBallotImageRelativePath(
  electionDefinitionId: string,
  cvrId: string,
  side: Side
): string {
  assert(
    !electionDefinitionId.includes(sep),
    `Election definition ID contains a path separator: ${electionDefinitionId}`
  );
  assert(!cvrId.includes(sep), `CVR ID contains a path separator: ${cvrId}`);
  return join(electionDefinitionId, `${cvrId}-${side}`);
}

/**
 * Returns the full ballot image path rooted at the ballot images directory.
 */
export function getBallotImageFilePath(
  ballotImagesPath: string,
  electionDefinitionId: string,
  cvrId: string,
  side: Side
): string {
  return join(
    ballotImagesPath,
    getBallotImageRelativePath(electionDefinitionId, cvrId, side)
  );
}
