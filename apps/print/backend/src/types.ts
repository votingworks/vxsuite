import { EncodedBallotEntry } from '@votingworks/types';

export interface BallotPrintEntry extends EncodedBallotEntry {
  ballotPrintId: string;
}
