import type { DateWithoutTime } from '@votingworks/basics';
import {
  DateWithoutTimeSchema,
  type District,
  type DistrictId,
  type ElectionId,
  ElectionIdSchema,
  type ElectionType,
  ElectionTypeSchema,
  type LanguageCode,
  LanguageCodeSchema,
  type Party,
  type PartyId,
  type PollingPlace,
  type Precinct,
  type PrecinctId,
  type PrecinctRegisteredVoterCountEntry,
} from '@votingworks/types';
import { z } from 'zod/v4';

export type ExternalElectionSource = 'ms-sems';

export interface ElectionInfo {
  electionId: ElectionId;
  type: ElectionType;
  isMiCombinedBallotPrimary?: boolean;
  date: DateWithoutTime;
  title: string;
  state: string;
  jurisdictionName: string;
  seal: string;
  languageCodes: LanguageCode[];
  signatureImage?: string;
  signatureCaption?: string;
  externalSource?: ExternalElectionSource;
}

export type ElectionInfoUpdate = Omit<ElectionInfo, 'externalSource'>;

const TextInput = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0);

export const ElectionInfoUpdateSchema = z.object({
  electionId: ElectionIdSchema,
  type: ElectionTypeSchema,
  isMiCombinedBallotPrimary: z.boolean().optional(),
  date: DateWithoutTimeSchema,
  title: TextInput,
  state: TextInput,
  jurisdictionName: TextInput,
  seal: z.string(),
  signatureImage: z.string().optional(),
  signatureCaption: z.string().optional(),
  languageCodes: z.array(LanguageCodeSchema),
}) satisfies z.ZodType<ElectionInfoUpdate>;

export interface DistrictsUpdate {
  readonly electionId: ElectionId;
  readonly deletedDistrictIds?: DistrictId[];
  readonly newDistricts?: District[];
  readonly updatedDistricts?: District[];
}

export interface PartiesUpdate {
  readonly electionId: ElectionId;
  readonly deletedPartyIds?: PartyId[];
  readonly newParties?: Party[];
  readonly updatedParties?: Party[];
}

export interface PrecinctCreate {
  readonly electionId: ElectionId;
  readonly newPrecinct: Precinct;
  readonly registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
}

export interface PrecinctUpdate {
  readonly electionId: ElectionId;
  readonly updatedPrecinct: Precinct;
  readonly registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
}

export interface PrecinctDelete {
  readonly electionId: ElectionId;
  readonly precinctId: PrecinctId;
}

export interface PollingPlaceSet {
  readonly electionId: ElectionId;
  readonly place: PollingPlace;
}

export interface PollingPlaceDelete {
  readonly electionId: ElectionId;
  readonly id: string;
}
