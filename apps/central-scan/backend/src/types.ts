import { PageInterpretation } from '@votingworks/types';

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T;
  contestIds?: readonly string[];
}

export interface BallotPageQrcode {
  data: Uint8Array;
  position: 'top' | 'bottom';
}
