import { BallotMode } from '@votingworks/hmpb';
import { BallotStyleId, BallotType } from '@votingworks/types';

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
