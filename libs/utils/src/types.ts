import { z } from 'zod'

export type TallyCount = number
export const TallyCountSchema = z.number()

export interface CandidateVoteTally {
  candidates: TallyCount[]
  writeIns: TallyCount
  undervotes: TallyCount
  overvotes: TallyCount
  ballotsCast: TallyCount
}
export const CandidateVoteTallySchema: z.ZodSchema<CandidateVoteTally> =
  z.object({
    candidates: z.array(TallyCountSchema),
    writeIns: TallyCountSchema,
    undervotes: TallyCountSchema,
    overvotes: TallyCountSchema,
    ballotsCast: TallyCountSchema,
  })

export interface YesNoVoteTally {
  yes: TallyCount
  no: TallyCount
  undervotes: TallyCount
  overvotes: TallyCount
  ballotsCast: TallyCount
}
export const YesNoVoteTallySchema: z.ZodSchema<YesNoVoteTally> = z.object({
  yes: TallyCountSchema,
  no: TallyCountSchema,
  undervotes: TallyCountSchema,
  overvotes: TallyCountSchema,
  ballotsCast: TallyCountSchema,
})

export interface MsEitherNeitherTally {
  ballotsCast: TallyCount
  eitherOption: TallyCount
  neitherOption: TallyCount
  eitherNeitherUndervotes: TallyCount
  eitherNeitherOvervotes: TallyCount
  firstOption: TallyCount
  secondOption: TallyCount
  pickOneUndervotes: TallyCount
  pickOneOvervotes: TallyCount
}
export const MsEitherNeitherTallySchema: z.ZodSchema<MsEitherNeitherTally> =
  z.object({
    ballotsCast: TallyCountSchema,
    eitherOption: TallyCountSchema,
    neitherOption: TallyCountSchema,
    eitherNeitherUndervotes: TallyCountSchema,
    eitherNeitherOvervotes: TallyCountSchema,
    firstOption: TallyCountSchema,
    secondOption: TallyCountSchema,
    pickOneUndervotes: TallyCountSchema,
    pickOneOvervotes: TallyCountSchema,
  })

export type Tally = (
  | CandidateVoteTally
  | YesNoVoteTally
  | MsEitherNeitherTally
)[]
export const TallySchema: z.ZodSchema<Tally> = z.array(
  z.union([
    CandidateVoteTallySchema,
    YesNoVoteTallySchema,
    MsEitherNeitherTallySchema,
  ])
)

export enum TallySourceMachineType {
  BMD = 'bmd',
  PRECINCT_SCANNER = 'precinct_scanner',
}
export const TallySourceMachineTypeSchema = z.nativeEnum(TallySourceMachineType)

export interface CardTallyMetadataEntry {
  readonly machineId: string
  readonly timeSaved: number
  readonly ballotCount: number
}
export const CardTallyMetadataEntrySchema: z.ZodSchema<CardTallyMetadataEntry> =
  z.object({
    machineId: z.string(),
    timeSaved: z.number(),
    ballotCount: z.number(),
  })

export interface BMDCardTally {
  readonly tallyMachineType: TallySourceMachineType.BMD
  readonly tally: Tally
  readonly metadata: readonly CardTallyMetadataEntry[]
  readonly totalBallotsPrinted: number
}
export const BMDCardTallySchema: z.ZodSchema<BMDCardTally> = z.object({
  tallyMachineType: TallySourceMachineTypeSchema.refine(
    (tallyMachineType) => tallyMachineType === TallySourceMachineType.BMD
  ) as z.ZodSchema<TallySourceMachineType.BMD>,
  tally: TallySchema,
  metadata: z.array(CardTallyMetadataEntrySchema),
  totalBallotsPrinted: z.number(),
})

export interface PrecinctScannerCardTally {
  readonly tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER
  readonly tally: Tally
  readonly metadata: readonly CardTallyMetadataEntry[]
  readonly totalBallotsScanned: number
  readonly isLiveMode: boolean
  readonly isPollsOpen: boolean
}
export const PrecinctScannerCardTallySchema: z.ZodSchema<PrecinctScannerCardTally> =
  z.object({
    tallyMachineType: TallySourceMachineTypeSchema.refine(
      (tallyMachineType) =>
        tallyMachineType === TallySourceMachineType.PRECINCT_SCANNER
    ) as z.ZodSchema<TallySourceMachineType.PRECINCT_SCANNER>,
    tally: TallySchema,
    metadata: z.array(CardTallyMetadataEntrySchema),
    totalBallotsScanned: z.number(),
    isLiveMode: z.boolean(),
    isPollsOpen: z.boolean(),
  })

export type CardTally = BMDCardTally | PrecinctScannerCardTally
export const CardTallySchema = z.union([
  BMDCardTallySchema,
  PrecinctScannerCardTallySchema,
])

/**
 * Identity function useful for asserting the type of the argument/return value.
 * Mainly useful with an object literal argument used in a context where a
 * variable declaration with an explicit type annotation is inelegant, such as
 * when providing a response to `fetch-mock`.
 *
 * @example
 *
 * fetchMock.get('/api', typedAs<MyResponseType>({
 *   status: 'ok',
 *   value: 42,
 * }))
 *
 * @example
 *
 * expect(value).toEqual(typedAs<MyType>({
 *   a: 1,
 *   b: 2,
 * }))
 */
export function typedAs<Type>(value: Type): Type {
  return value
}
