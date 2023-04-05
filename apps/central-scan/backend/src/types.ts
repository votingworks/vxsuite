import { BallotLocale, PageInterpretation } from '@votingworks/types';
import { BallotStyleData } from '@votingworks/utils';

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

export interface BallotConfig extends BallotStyleData {
  filename: string;
  /**
   * @deprecated to be replaced (https://github.com/votingworks/roadmap/issues/15)
   */
  locales: BallotLocale;
  isLiveMode: boolean;
}
