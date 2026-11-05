export type ExternalElectionSource = 'ms-sems';

export interface ElectionInfo {
  jurisdictionId: string;
  electionId: ElectionId;
  type: ElectionType;
  isMiCombinedBallotPrimary: boolean;
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

export type ElectionInfoUpdate = Omit<
  ElectionInfo,
  'jurisdictionId' | 'externalSource'
>;

const TextInput = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0);

export const ElectionInfoUpdateSchema: z.ZodType<ElectionInfoUpdate> = z.object(
  {
    electionId: ElectionIdSchema,
    type: ElectionTypeSchema,
    isMiCombinedBallotPrimary: z.boolean(),
    date: DateWithoutTimeSchema,
    title: TextInput,
    state: TextInput,
    jurisdictionName: TextInput,
    seal: z.string(),
    signatureImage: z.string().optional(),
    signatureCaption: z.string().optional(),
    languageCodes: z.array(LanguageCodeSchema),
  }
);
