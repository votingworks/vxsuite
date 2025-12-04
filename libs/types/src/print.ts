import { Id } from './generic';
import { LanguageCode } from './language_code';

export interface BallotPrintCount {
  ballotStyleId: Id;
  precinctOrSplitName: string;
  partyName?: string;
  languageCode: LanguageCode;
  absenteeCount: number;
  precinctCount: number;
  totalCount: number;
}
