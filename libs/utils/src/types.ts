import { Optional, Result } from '@votingworks/types'
import { Observable } from 'rxjs'
import { z } from 'zod'

export type TallyCount = number
export const TallyCountSchema = z.number()

export interface SerializedCandidateVoteTally {
  candidates: TallyCount[]
  writeIns: TallyCount
  undervotes: TallyCount
  overvotes: TallyCount
  ballotsCast: TallyCount
}
export const SerializedCandidateVoteTallySchema: z.ZodSchema<SerializedCandidateVoteTally> =
  z.object({
    candidates: z.array(TallyCountSchema),
    writeIns: TallyCountSchema,
    undervotes: TallyCountSchema,
    overvotes: TallyCountSchema,
    ballotsCast: TallyCountSchema,
  })

export interface SerializedYesNoVoteTally {
  yes: TallyCount
  no: TallyCount
  undervotes: TallyCount
  overvotes: TallyCount
  ballotsCast: TallyCount
}
export const SerializedYesNoVoteTallySchema: z.ZodSchema<SerializedYesNoVoteTally> =
  z.object({
    yes: TallyCountSchema,
    no: TallyCountSchema,
    undervotes: TallyCountSchema,
    overvotes: TallyCountSchema,
    ballotsCast: TallyCountSchema,
  })

export interface SerializedMsEitherNeitherTally {
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
export const SerializedMsEitherNeitherTallySchema: z.ZodSchema<SerializedMsEitherNeitherTally> =
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

export type SerializedTally = (
  | SerializedCandidateVoteTally
  | SerializedYesNoVoteTally
  | SerializedMsEitherNeitherTally
)[]
export const TallySchema: z.ZodSchema<SerializedTally> = z.array(
  z.union([
    SerializedCandidateVoteTallySchema,
    SerializedYesNoVoteTallySchema,
    SerializedMsEitherNeitherTallySchema,
  ])
)

export type CompressedTally = number[][]

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
  readonly tally: SerializedTally
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
  readonly tally: SerializedTally
  readonly metadata: readonly CardTallyMetadataEntry[]
  readonly totalBallotsScanned: number
  readonly isLiveMode: boolean
  readonly isPollsOpen: boolean
  readonly absenteeBallots: number
  readonly precinctBallots: number
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
    absenteeBallots: z.number(),
    precinctBallots: z.number(),
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

/**
 * Describes the API for application-level persistent storage. Values must be
 * objects that can be persisted via JSON.stringify and JSON.parse.
 */
export interface Storage {
  /**
   * Gets an object from storage by key.
   */
  get(key: string): Promise<unknown>

  /**
   * Sets an object in storage by key.
   */
  set(key: string, value: unknown): Promise<void>

  /**
   * Removes an object in storage by key.
   */
  remove(key: unknown): Promise<void>

  /**
   * Clears all objects out of storage.
   */
  clear(): Promise<void>
}

export interface CardAbsentAPI {
  present: false
}
export interface CardPresentAPI {
  present: true
  shortValue?: string
  longValueExists?: boolean
}
export type CardAPI = CardAbsentAPI | CardPresentAPI

/**
 * Defines the API for accessing a smart card reader.
 */
export interface Card {
  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  readStatus(): Promise<CardAPI>

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value and validates it using `schema`.
   */
  readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>>

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  readLongString(): Promise<Optional<string>>

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  readLongUint8Array(): Promise<Optional<Uint8Array>>

  /**
   * Writes a new short value to the card.
   */
  writeShortValue(value: string): Promise<void>

  /**
   * Writes a new long value as a serialized object.
   */
  writeLongObject(value: unknown): Promise<void>

  /**
   * Writes binary data to the long value.
   */
  writeLongUint8Array(value: Uint8Array): Promise<void>
}

export interface PrinterStatus {
  connected: boolean
}

/**
 * Defines the API for accessing hardware status.
 */
export interface Hardware {
  /**
   * Reads Battery status
   */
  readBatteryStatus(): Promise<KioskBrowser.BatteryInfo>

  /**
   * Reads Printer status
   */
  readPrinterStatus(): Promise<PrinterStatus>

  /**
   * Subscribe to USB device updates.
   */
  devices: Observable<Iterable<KioskBrowser.Device>>

  /**
   * Subscribe to USB device updates.
   */
  printers: Observable<Iterable<KioskBrowser.PrinterInfo>>
}

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: Exclude<KioskBrowser.PrintOptions['sides'], undefined>
}
export interface Printer {
  print(options: PrintOptions): Promise<void>
}
