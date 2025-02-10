import { DateWithoutTime } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import z from 'zod';
import {
  ElectionIdSchema,
  PrinterStatus,
  Election as VxSuiteElection,
} from '@votingworks/types';
import { BatteryInfo } from '@votingworks/backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { Printer } from '@votingworks/printing';
import type { Api } from './app';
import { HlcTimestamp } from './hybrid_logical_clock';
import type { Store } from './store';

export interface AppContext {
  workspace: Workspace;
  auth: DippedSmartCardAuthApi;
  usbDrive: UsbDrive;
  printer: Printer;
  machineId: string;
}

export interface Workspace {
  assetDirectoryPath: string;
  store: Store;
}

export type Election = Pick<
  VxSuiteElection,
  'id' | 'title' | 'date' | 'precincts'
>;

export const ElectionSchema: z.ZodSchema<
  Election,
  z.ZodTypeDef,
  Omit<Election, 'date'> & { date: string }
> = z.object({
  id: ElectionIdSchema,
  title: z.string(),
  date: z
    .string()
    .date()
    .transform((date) => new DateWithoutTime(date)),
  precincts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .min(1),
});

export enum EventType {
  VoterCheckIn = 'VoterCheckIn',
  UndoVoterCheckIn = 'UndoVoterCheckIn',
  VoterRegistration = 'VoterRegistration',
}

export type VoterIdentificationMethod =
  | {
      type: 'photoId';
      state: string;
    }
  | {
      type: 'personalRecognizance';
      recognizer: 'supervisor' | 'moderator' | 'cityClerk';
    };

export interface VoterCheckIn {
  identificationMethod: VoterIdentificationMethod;
  isAbsentee: boolean;
  timestamp: string;
  machineId: string;
}

export const VoterCheckInSchema: z.ZodSchema<VoterCheckIn> = z.object({
  identificationMethod: z.union([
    z.object({
      type: z.literal('photoId'),
      state: z.string(),
    }),
    z.object({
      type: z.literal('personalRecognizance'),
      recognizer: z.union([
        z.literal('supervisor'),
        z.literal('moderator'),
        z.literal('cityClerk'),
      ]),
    }),
  ]),
  isAbsentee: z.boolean(),
  timestamp: z.string(),
  machineId: z.string(),
});

export type PartyAbbreviation = 'DEM' | 'REP' | 'UND';

export interface Voter {
  voterId: string;
  lastName: string;
  suffix: string;
  firstName: string;
  middleName: string;
  streetNumber: string;
  addressSuffix: string;
  houseFractionNumber: string;
  streetName: string;
  apartmentUnitNumber: string;
  addressLine2: string;
  addressLine3: string;
  postalCityTown: string;
  state: string;
  postalZip5: string;
  zip4: string;
  mailingStreetNumber: string;
  mailingSuffix: string;
  mailingHouseFractionNumber: string;
  mailingStreetName: string;
  mailingApartmentUnitNumber: string;
  mailingAddressLine2: string;
  mailingAddressLine3: string;
  mailingCityTown: string;
  mailingState: string;
  mailingZip5: string;
  mailingZip4: string;
  party: PartyAbbreviation;
  district: string;
  checkIn?: VoterCheckIn;
  registrationEvent?: VoterRegistration;
}

export interface VoterRegistrationRequest {
  firstName: string;
  lastName: string;
  middleName: string;
  suffix: string;
  party: PartyAbbreviation | '';
  streetNumber: string;
  streetName: string;
  streetSuffix: string;
  houseFractionNumber: string;
  apartmentUnitNumber: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  zipCode: string;
}

export interface VoterRegistration extends VoterRegistrationRequest {
  party: PartyAbbreviation;
  timestamp: string;
  voterId: string;
  district: string;
}

export const VoterRegistrationSchema: z.ZodSchema<VoterRegistration> = z.object(
  {
    firstName: z.string(),
    lastName: z.string(),
    middleName: z.string(),
    suffix: z.string(),
    party: z.union([z.literal('DEM'), z.literal('REP'), z.literal('UND')]),
    streetNumber: z.string(),
    streetName: z.string(),
    streetSuffix: z.string(),
    houseFractionNumber: z.string(),
    apartmentUnitNumber: z.string(),
    addressLine2: z.string(),
    addressLine3: z.string(),
    city: z.string(),
    zipCode: z.string(),
    timestamp: z.string(),
    voterId: z.string(),
    district: z.string(),
  }
);

export const VoterSchema: z.ZodSchema<Voter> = z.object({
  voterId: z.string(),
  lastName: z.string(),
  suffix: z.string(),
  firstName: z.string(),
  middleName: z.string(),
  streetNumber: z.string(),
  addressSuffix: z.string(),
  houseFractionNumber: z.string(),
  streetName: z.string(),
  apartmentUnitNumber: z.string(),
  addressLine2: z.string(),
  addressLine3: z.string(),
  postalCityTown: z.string(),
  state: z.string(),
  postalZip5: z.string(),
  zip4: z.string(),
  mailingStreetNumber: z.string(),
  mailingSuffix: z.string(),
  mailingHouseFractionNumber: z.string(),
  mailingStreetName: z.string(),
  mailingApartmentUnitNumber: z.string(),
  mailingAddressLine2: z.string(),
  mailingAddressLine3: z.string(),
  mailingCityTown: z.string(),
  mailingState: z.string(),
  mailingZip5: z.string(),
  mailingZip4: z.string(),
  party: z.union([z.literal('DEM'), z.literal('REP'), z.literal('UND')]),
  district: z.string(),
  checkIn: VoterCheckInSchema.optional(),
  registrationEvent: VoterRegistrationSchema.optional(),
});

export interface MachineInformation {
  machineId: string;
  configuredElectionId?: string;
}

export type VectorClock = Record<string, number>;

export const VectorClockSchema: z.ZodSchema<VectorClock> = z.record(z.number());

export interface PollbookEvent {
  type: EventType;
  machineId: string;
  localEventId: number;
  timestamp: HlcTimestamp;
}

export interface VoterCheckInEvent extends PollbookEvent {
  type: EventType.VoterCheckIn;
  voterId: string;
  checkInData: VoterCheckIn;
}

export interface UndoVoterCheckInEvent extends PollbookEvent {
  type: EventType.UndoVoterCheckIn;
  voterId: string;
}

export interface VoterRegistrationEvent extends PollbookEvent {
  type: EventType.VoterRegistration;
  voterId: string;
  registrationData: VoterRegistration;
}

export interface VoterSearchParams {
  lastName: string;
  firstName: string;
}

export type StreetSide = 'even' | 'odd' | 'all';

export interface ValidStreetInfo {
  streetName: string;
  side: StreetSide;
  lowRange: number;
  highRange: number;
  postalCity: string;
  zip5: string;
  zip4: string;
  district: string;
  schoolDist: string;
  villageDist: string;
  usCong: string;
  execCounc: string;
  stateSen: string;
  stateRep: string;
  stateRepFlot: string;
  countyName: string;
  countyCommDist: string;
}

export const ValidStreetInfoSchema: z.ZodSchema<ValidStreetInfo[]> = z.array(
  z.object({
    streetName: z.string(),
    side: z.union([z.literal('even'), z.literal('odd'), z.literal('all')]),
    lowRange: z.number(),
    highRange: z.number(),
    postalCity: z.string(),
    zip5: z.string(),
    zip4: z.string(),
    district: z.string(),
    schoolDist: z.string(),
    villageDist: z.string(),
    usCong: z.string(),
    execCounc: z.string(),
    stateSen: z.string(),
    stateRep: z.string(),
    stateRepFlot: z.string(),
    countyName: z.string(),
    countyCommDist: z.string(),
  })
);

export interface PollbookPackage {
  election: Election;
  voters: Voter[];
  validStreets: ValidStreetInfo[];
}

export interface PollbookService {
  apiClient?: grout.Client<Api>;
  machineId: string;
  lastSeen: Date;
  status: PollbookConnectionStatus;
}

export interface ConnectedPollbookService extends PollbookService {
  status: PollbookConnectionStatus.Connected;
  apiClient: grout.Client<Api>;
}

export interface PollbookServiceInfo
  extends Omit<PollbookService, 'apiClient'> {
  numCheckIns: number;
}

export interface NetworkStatus {
  pollbooks: PollbookServiceInfo[];
  isOnline: boolean;
}

export interface DeviceStatuses {
  battery?: BatteryInfo;
  printer: PrinterStatus;
  usbDrive: UsbDriveStatus;
  network: {
    isOnline: boolean;
    pollbooks: PollbookServiceInfo[];
  };
}

export enum PollbookConnectionStatus {
  Connected = 'Connected',
  ShutDown = 'ShutDown',
  LostConnection = 'LostConnection',
  WrongElection = 'WrongElection',
}

export interface EventDbRow {
  event_id: number;
  machine_id: string;
  voter_id: string;
  event_type: EventType;
  event_data: string;
  physical_time: number;
  logical_counter: number;
}

export type ConfigurationStatus = 'loading' | 'not-found';
