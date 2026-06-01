import z from 'zod/v4';
import { Id } from './generic';
import { LanguageCode } from './language_code';

export interface BallotStyleQrCode {
  ballotStyleId: string;
}

export const BallotStyleQrCodeSchema: z.ZodSchema<BallotStyleQrCode> = z.object(
  {
    ballotStyleId: z.string(),
  }
);

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
