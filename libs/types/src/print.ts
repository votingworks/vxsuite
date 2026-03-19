import { Id } from './generic.js';
import { LanguageCode } from './language_code.js';

export interface BallotPrintCount {
  ballotStyleId: Id;
  precinctOrSplitName: string;
  precinctId: Id;
  partyName?: string;
  languageCode: LanguageCode;
  absenteeCount: number;
  precinctCount: number;
  totalCount: number;
}
