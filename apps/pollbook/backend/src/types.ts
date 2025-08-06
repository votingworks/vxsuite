import * as grout from '@votingworks/grout';
import z from 'zod/v4';
import {
  PrinterStatus,
  ElectionDefinition,
  VoterAddressChange as VoterAddressChangeType,
  ValidStreetInfo,
  Voter,
  VoterCheckIn as VoterCheckInType,
  VoterMailingAddressChange as VoterMailingAddressChangeType,
  VoterNameChange as VoterNameChangeType,
  VoterRegistration as VoterRegistrationType,
  PartyAbbreviation,
} from '@votingworks/types';
import { BatteryInfo } from '@votingworks/backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { Printer } from '@votingworks/printing';
import { BaseLogger } from '@votingworks/logging';
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
  logger: BaseLogger;
}

export interface PeerWorkspace {
  assetDirectoryPath: string;
  store: PeerStore;
  logger: BaseLogger;
}

export enum EventType {
  VoterCheckIn = 'VoterCheckIn',
  UndoVoterCheckIn = 'UndoVoterCheckIn',
  VoterAddressChange = 'VoterAddressChange',
  VoterMailingAddressChange = 'VoterMailingAddressChange',
  VoterNameChange = 'VoterNameChange',
  VoterRegistration = 'VoterRegistration',
  MarkInactive = 'MarkInactive',
}

export type VectorClock = Record<string, number>;

export const VectorClockSchema: z.ZodSchema<VectorClock> = z.record(
  z.string(),
  z.number()
);

export interface PollbookEventBase {
  type: EventType;
  machineId: string;
  receiptNumber: number;
  timestamp: HlcTimestamp;
}

export interface VoterCheckInEvent extends PollbookEventBase {
  type: EventType.VoterCheckIn;
  voterId: string;
  checkInData: VoterCheckInType;
}

export interface UndoVoterCheckInEvent extends PollbookEventBase {
  type: EventType.UndoVoterCheckIn;
  voterId: string;
  reason: string;
}

export interface VoterAddressChangeEvent extends PollbookEventBase {
  type: EventType.VoterAddressChange;
  voterId: string;
  addressChangeData: VoterAddressChangeType;
}

export interface VoterMailingAddressChangeEvent extends PollbookEventBase {
  type: EventType.VoterMailingAddressChange;
  voterId: string;
  mailingAddressChangeData: VoterMailingAddressChangeType;
}

export interface VoterNameChangeEvent extends PollbookEventBase {
  type: EventType.VoterNameChange;
  voterId: string;
  nameChangeData: VoterNameChangeType;
}

export interface VoterRegistrationEvent extends PollbookEventBase {
  type: EventType.VoterRegistration;
  voterId: string;
  registrationData: VoterRegistrationType;
}

export interface VoterInactivatedEvent extends PollbookEventBase {
  type: EventType.MarkInactive;
  voterId: string;
}

export type PollbookEvent =
  | VoterCheckInEvent
  | UndoVoterCheckInEvent
  | VoterAddressChangeEvent
  | VoterMailingAddressChangeEvent
  | VoterNameChangeEvent
  | VoterInactivatedEvent
  | VoterRegistrationEvent;

export interface VoterSearchParams {
  lastName: string;
  middleName: string;
  firstName: string;
  suffix: string;
  exactMatch?: boolean;
}

export interface PollbookPackage {
  packageHash: string;
  electionDefinition: ElectionDefinition;
  voters: Voter[];
  validStreets: ValidStreetInfo[];
}

export interface PollbookConfigurationInformation {
  electionId?: string;
  electionBallotHash?: string;
  pollbookPackageHash?: string;
  electionTitle?: string;
  configuredPrecinctId?: string;
  machineId: string;
  codeVersion: string;
}

export type ConfigurationError =
  | 'pollbook-connection-problem'
  | 'already-configured'
  | 'invalid-pollbook-package';

export const PollbookInformationSchema: z.ZodSchema<PollbookConfigurationInformation> =
  z.object({
    electionId: z.string().optional(),
    electionBallotHash: z.string().optional(),
    pollbookPackageHash: z.string().optional(),
    electionTitle: z.string().optional(),
    configuredPrecinctId: z.string().optional(),
    machineId: z.string(),
    codeVersion: z.string(),
  });

export interface PollbookService extends PollbookConfigurationInformation {
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

export interface BarcodeScannerStatus {
  connected: boolean;
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
  barcodeScanner: BarcodeScannerStatus;
}

export enum PollbookConnectionStatus {
  Connected = 'Connected',
  ShutDown = 'ShutDown',
  LostConnection = 'LostConnection',
  MismatchedConfiguration = 'MismatchedConfiguration',
  IncompatibleSoftwareVersion = 'IncompatibleSoftwareVersion',
}

// These statuses may exists between pollbooks that are talking to each other. Lost Connection should override them when connectivity is lost.
export const CommunicatingPollbookConnectionStatuses: PollbookConnectionStatus[] =
  [
    PollbookConnectionStatus.Connected,
    PollbookConnectionStatus.MismatchedConfiguration,
    PollbookConnectionStatus.IncompatibleSoftwareVersion,
  ];

export interface EventDbRow {
  event_id: number;
  machine_id: string;
  voter_id: string;
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

export interface PrimarySummaryStatistics extends SummaryStatistics {
  totalUndeclaredDemCheckIns: number;
  totalUndeclaredRepCheckIns: number;
}

export type ConfigurationStatus =
  | 'loading'
  | 'not-found-usb'
  | 'usb-configuration-error'
  | 'not-found-network'
  | 'not-found-configuration-matching-election-card'
  | 'network-configuration-error'
  | 'recently-unconfigured'
  | 'network-conflicting-pollbook-packages-match-card';

export type VoterCheckInError =
  | 'already_checked_in'
  | 'undeclared_voter_missing_ballot_party'
  | 'unknown_voter_party';

export interface DuplicateVoterError {
  type: 'duplicate-voter';
  message: string;
  matchingVoters: Voter[];
}

export interface AamvaDocument {
  issuingJurisdiction: string;
  firstName: string;
  middleName: string;
  lastName: string;
  nameSuffix: string;
}

export const AamvaDocumentSchema: z.ZodSchema<AamvaDocument> = z.strictObject({
  issuingJurisdiction: z.string(),
  firstName: z.string(),
  middleName: z.string(),
  lastName: z.string(),
  nameSuffix: z.string(),
});

export interface BarcodeScannerError {
  error: string;
}

export const BarcodeScannerErrorSchema: z.ZodSchema<BarcodeScannerError> =
  z.strictObject({
    error: z.string(),
  });

export type BarcodeScannerPayload = AamvaDocument | BarcodeScannerError;

export const BarcodeScannerPayloadSchema = z.union([
  AamvaDocumentSchema,
  BarcodeScannerErrorSchema,
]);

export function isAamvaDocument(
  payload: BarcodeScannerPayload
): payload is AamvaDocument {
  return AamvaDocumentSchema.safeParse(payload).success;
}

export function isBarcodeScannerError(
  payload?: BarcodeScannerPayload
): payload is BarcodeScannerError {
  return BarcodeScannerErrorSchema.safeParse(payload).success;
}

export type PartyFilterAbbreviation = 'ALL' | PartyAbbreviation;
