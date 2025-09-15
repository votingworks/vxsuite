import {
  BallotStyle as VxfBallotStyle,
  BallotStyleId,
  DistrictId,
  PartyId,
  BallotStyleGroupId,
  LanguageCode,
  PrecinctOrSplitId,
  ElectionType,
  ElectionId,
  CompressedTally,
  BallotPaperSize,
  NhCandidateRotationMethod,
  ElectionIdSchema,
  DateWithoutTimeSchema,
  LanguageCodeSchema,
  NhCandidateRotationMethodSchema,
  HmpbBallotPaperSizeSchema,
} from '@votingworks/types';
import { DateWithoutTime } from '@votingworks/basics';
import z from 'zod/v4';

// We also create a new type for a ballot style, that can reference precincts and
// splits. We generate ballot styles on demand, so it won't be stored in the db.
export interface BallotStyle {
  districtIds: readonly DistrictId[];
  id: BallotStyleId;
  group_id: BallotStyleGroupId;
  languages: LanguageCode[];
  partyId?: PartyId;
  precinctsOrSplits: readonly PrecinctOrSplitId[];
}

export function convertToVxfBallotStyle(
  ballotStyle: BallotStyle
): VxfBallotStyle {
  return {
    id: ballotStyle.id,
    groupId: ballotStyle.group_id,
    precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
    districts: ballotStyle.districtIds,
    partyId: ballotStyle.partyId,
    languages: ballotStyle.languages,
  };
}

export enum UsState {
  NEW_HAMPSHIRE = 'New Hampshire',
  MISSISSIPPI = 'Mississippi',
  UNKNOWN = 'Unknown',
}

export function normalizeState(state: string): UsState {
  switch (state.toLowerCase()) {
    case 'nh':
    case 'new hampshire':
      return UsState.NEW_HAMPSHIRE;
    case 'ms':
    case 'mississippi':
      return UsState.MISSISSIPPI;
    default:
      return UsState.UNKNOWN;
  }
}

export interface User {
  /**
   * The user's name is generally defaulted to their email address due to the
   * way we create users, but we still use the name field to make it clear that
   * this is what should be displayed as their identity.
   */
  name: string;
  auth0Id: string;
  orgId: string;
}

export interface Org {
  name: string;
  id: string;
}

export type ElectionStatus = 'notStarted' | 'inProgress' | 'ballotsFinalized';

export interface ElectionListing {
  orgId: string;
  orgName: string;
  electionId: ElectionId;
  title: string;
  date: DateWithoutTime;
  type: ElectionType;
  jurisdiction: string;
  state: string;
  status: ElectionStatus;
}

export interface ElectionInfo {
  electionId: ElectionId;
  type: ElectionType;
  date: DateWithoutTime;
  title: string;
  state: string;
  jurisdiction: string;
  seal: string;
  languageCodes: LanguageCode[];
  signatureImage?: string;
  signatureCaption?: string;
}

export const TextInput = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0);

export const ElectionInfoSchema: z.ZodSchema<ElectionInfo> = z.object({
  electionId: ElectionIdSchema,
  type: z.union([z.literal('general'), z.literal('primary')]),
  date: DateWithoutTimeSchema,
  title: TextInput,
  state: TextInput,
  jurisdiction: TextInput,
  seal: z.string(),
  signatureImage: z.string().optional(),
  signatureCaption: z.string().optional(),
  languageCodes: z.array(LanguageCodeSchema),
});

export interface BallotLayoutSettings {
  paperSize: BallotPaperSize;
  compact: boolean;
  candidateRotationMethod?: NhCandidateRotationMethod;
}

export const BallotLayoutSettingsSchema: z.ZodSchema<BallotLayoutSettings> =
  z.object({
    paperSize: HmpbBallotPaperSizeSchema,
    compact: z.boolean(),
    candidateRotationMethod: NhCandidateRotationMethodSchema.optional(),
  });

export interface ResultsReportInfo {
  ballotHash: string;
  machineId: string;
  isLive: boolean;
  signedTimestamp: Date;
  tally: CompressedTally;
  precinctId?: PrecinctOrSplitId;
}

export type ResultsReportingError = 'invalid-payload';
