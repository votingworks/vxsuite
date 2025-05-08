import * as grout from '@votingworks/grout';
import z from 'zod';
import { PrinterStatus, ElectionDefinition } from '@votingworks/types';
import { BatteryInfo } from '@votingworks/backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { Printer } from '@votingworks/printing';
import type { PeerApi } from './peer_app';
import { HlcTimestamp } from './hybrid_logical_clock';
import type { LocalStore } from './local_store';
import type { PeerStore } from './peer_store';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export interface LocalAppContext extends MachineConfig {
  workspace: LocalWorkspace;
  auth: DippedSmartCardAuthApi;
  usbDrive: UsbDrive;
  printer: Printer;
}

export interface PeerAppContext extends MachineConfig {
  auth: DippedSmartCardAuthApi;
  workspace: PeerWorkspace;
}

export interface LocalWorkspace {
  assetDirectoryPath: string;
  store: LocalStore;
  peerApiClient: grout.Client<PeerApi>;
}

export interface PeerWorkspace {
  assetDirectoryPath: string;
  store: PeerStore;
}

export enum EventType {
  VoterCheckIn = 'VoterCheckIn',
  UndoVoterCheckIn = 'UndoVoterCheckIn',
  VoterAddressChange = 'VoterAddressChange',
  VoterNameChange = 'VoterNameChange',
  VoterRegistration = 'VoterRegistration',
}

export type VoterIdentificationMethod =
  | { type: 'default' }
  | {
      type: 'outOfStateLicense';
      state: string;
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
      type: z.literal('default'),
    }),
    z.object({
      type: z.literal('outOfStateLicense'),
      state: z.string(),
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
  nameChange?: VoterNameChange;
  addressChange?: VoterAddressChange;
  registrationEvent?: VoterRegistration;
  checkIn?: VoterCheckIn;
}

export interface VoterAddressChangeRequest {
  streetNumber: string;
  streetName: string;
  streetSuffix: string;
  apartmentUnitNumber: string;
  houseFractionNumber: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface VoterAddressChange extends VoterAddressChangeRequest {
  timestamp: string;
}

const VoterAddressChangeSchemaInternal = z.object({
  streetNumber: z.string(),
  streetName: z.string(),
  streetSuffix: z.string(),
  apartmentUnitNumber: z.string(),
  houseFractionNumber: z.string(),
  addressLine2: z.string(),
  addressLine3: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  timestamp: z.string(),
});

export const VoterAddressChangeSchema: z.ZodSchema<VoterAddressChange> =
  VoterAddressChangeSchemaInternal;

export interface VoterNameChangeRequest {
  lastName: string;
  suffix: string;
  firstName: string;
  middleName: string;
}

export interface VoterNameChange extends VoterNameChangeRequest {
  timestamp: string;
}

const VoterNameChangeSchemaInternal = z.object({
  lastName: z.string(),
  suffix: z.string(),
  firstName: z.string(),
  middleName: z.string(),
  timestamp: z.string(),
});

export const VoterNameChangeSchema: z.ZodSchema<VoterNameChange> =
  VoterNameChangeSchemaInternal;

export interface VoterRegistrationRequest
  extends VoterAddressChangeRequest,
    VoterNameChangeRequest {
  party: PartyAbbreviation | '';
}

export interface VoterRegistration extends VoterRegistrationRequest {
  party: PartyAbbreviation;
  timestamp: string;
  voterId: string;
  district: string;
}

export const VoterRegistrationSchema: z.ZodSchema<VoterRegistration> =
  VoterAddressChangeSchemaInternal.merge(VoterNameChangeSchemaInternal).extend({
    party: z.union([z.literal('DEM'), z.literal('REP'), z.literal('UND')]),
    timestamp: z.string(),
    voterId: z.string(),
    district: z.string(),
  });

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
  addressChange: VoterAddressChangeSchema.optional(),
  nameChange: VoterNameChangeSchema.optional(),
});

export interface MachineInformation extends PollbookInformation {
  machineId: string;
  codeVersion: string;
}

export type VectorClock = Record<string, number>;

export const VectorClockSchema: z.ZodSchema<VectorClock> = z.record(z.number());

export interface PollbookEventBase {
  type: EventType;
  machineId: string;
  localEventId: number;
  receiptNumber: number;
  timestamp: HlcTimestamp;
}

export interface VoterCheckInEvent extends PollbookEventBase {
  type: EventType.VoterCheckIn;
  voterId: string;
  checkInData: VoterCheckIn;
}

export interface UndoVoterCheckInEvent extends PollbookEventBase {
  type: EventType.UndoVoterCheckIn;
  voterId: string;
  reason: string;
}

export interface VoterAddressChangeEvent extends PollbookEventBase {
  type: EventType.VoterAddressChange;
  voterId: string;
  addressChangeData: VoterAddressChange;
}

export interface VoterNameChangeEvent extends PollbookEventBase {
  type: EventType.VoterNameChange;
  voterId: string;
  nameChangeData: VoterNameChange;
}

export interface VoterRegistrationEvent extends PollbookEventBase {
  type: EventType.VoterRegistration;
  voterId: string;
  registrationData: VoterRegistration;
}

export type PollbookEvent =
  | VoterCheckInEvent
  | UndoVoterCheckInEvent
  | VoterAddressChangeEvent
  | VoterNameChangeEvent
  | VoterRegistrationEvent;

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
  })
);

export interface PollbookPackage {
  packageHash: string;
  electionDefinition: ElectionDefinition;
  voters: Voter[];
  validStreets: ValidStreetInfo[];
}

export interface PollbookInformation {
  electionId?: string;
  electionBallotHash?: string;
  pollbookPackageHash?: string;
  electionTitle?: string;
}

export type ConfigurationError =
  | 'pollbook-connection-problem'
  | 'already-configured'
  | 'invalid-pollbook-package';

export const PollbookInformationSchema: z.ZodSchema<PollbookInformation> =
  z.object({
    electionId: z.string().optional(),
    electionBallotHash: z.string().optional(),
    pollbookPackageHash: z.string().optional(),
    electionTitle: z.string().optional(),
  });

export interface PollbookService extends PollbookInformation {
  apiClient?: grout.Client<PeerApi>;
  address?: string;
  machineId: string;
  lastSeen: Date;
  status: PollbookConnectionStatus;
}

export interface ConnectedPollbookService extends PollbookService {
  status: PollbookConnectionStatus.Connected;
  apiClient: grout.Client<PeerApi>;
  address: string;
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
  receipt_number: number;
  event_type: EventType;
  event_data: string;
  physical_time: number;
  logical_counter: number;
}

export interface VoterGroup {
  existingVoters: Voter[];
  newRegistrations: Voter[];
}

export interface ThroughputStat {
  interval: number; // in minutes
  checkIns: number;
  startTime: string;
}
export interface SummaryStatistics {
  totalVoters: number;
  totalCheckIns: number;
  totalNewRegistrations: number;
  totalAbsenteeCheckIns: number;
}

export type ConfigurationStatus =
  | 'loading'
  | 'not-found-usb'
  | 'not-found-network'
  | 'not-found-configuration-matching-election-card'
  | 'network-configuration-error'
  | 'recently-unconfigured'
  | 'network-conflicting-pollbook-packages-match-card';
