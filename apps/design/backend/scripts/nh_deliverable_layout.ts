import { BallotType } from '@votingworks/types';
import { join } from 'node:path';

// The deliverable directory layout NH asked for, shared by the proofs
// (render_nh_batch) and final (render_nh_election_package) scripts so both
// produce an identical tree:
//   <out-dir>/ballots/<ballot type>/<party>/<town-or-ward> - <party> - <type>.pdf
//   <out-dir>/rov/<party>/<town-or-ward> - <party> - ROV.pdf
//   <out-dir>/election-packages/<town> - election-package-<hash>.zip
export const ELECTION_PACKAGES_DIR = 'election-packages';

interface BallotVariantLike {
  ballotMode?: string;
  ballotType: BallotType;
  isFederalOfficeOnly?: boolean;
  isUocava?: boolean;
}

/**
 * The deliverable ballot-type folder name for a ballot variant: one of
 * `precinct`, `absentee`, `foo`, `uocava`, or `sample`.
 */
export function deliverableType(variant: BallotVariantLike): string {
  if (variant.ballotMode === 'sample') return 'sample';
  if (variant.isUocava) return 'uocava';
  if (variant.isFederalOfficeOnly) return 'foo';
  return variant.ballotType === BallotType.Absentee ? 'absentee' : 'precinct';
}

/** Relative path of a ballot PDF within the deliverable tree. */
export function deliverableBallotPath(
  type: string,
  partyAbbrev: string,
  townWard: string
): string {
  return join(
    'ballots',
    type,
    partyAbbrev,
    `${townWard} - ${partyAbbrev} - ${type}.pdf`
  );
}

/** Relative path of a Return-of-Votes form within the deliverable tree. */
export function deliverableRovPath(
  partyAbbrev: string,
  townWard: string
): string {
  return join('rov', partyAbbrev, `${townWard} - ${partyAbbrev} - ROV.pdf`);
}

/**
 * Relative path of a town's election package. Flat under election-packages/,
 * with the town name leading the filename (no per-town directory).
 */
export function deliverablePackagePath(
  townName: string,
  combinedHash: string
): string {
  return join(
    ELECTION_PACKAGES_DIR,
    `${townName} - election-package-${combinedHash}.zip`
  );
}
