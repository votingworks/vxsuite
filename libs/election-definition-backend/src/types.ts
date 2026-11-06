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
  electionId: ElectionId;
  deletedDistrictIds?: DistrictId[];
  newDistricts?: District[];
  updatedDistricts?: District[];
}
