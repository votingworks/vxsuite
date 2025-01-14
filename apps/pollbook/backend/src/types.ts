import { DateWithoutTime } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import z from 'zod';
import {
  ElectionIdSchema,
  PrinterStatus,
  Election as VxSuiteElection,
} from '@votingworks/types';
import { BatteryInfo } from '@votingworks/backend';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import type { Api } from './app';

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

export type VoterIdentificationMethod =
  | {
      type: 'photoId';
      state: string;
    }
  | {
      type: 'challengedVoterAffidavit';
    }
  | {
      type: 'personalRecognizance';
      recognizer: 'supervisor' | 'moderator' | 'cityClerk';
    };

export interface VoterCheckIn {
  identificationMethod: VoterIdentificationMethod;
  timestamp: string;
  machineId: string;
}

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
  party: string;
  district: string;
  checkIn?: VoterCheckIn;
}

export interface VoterSearchParams {
  lastName: string;
  firstName: string;
}

export interface PollbookPackage {
  election: Election;
  voters: Voter[];
}

export interface PollBookService {
  apiClient: grout.Client<Api>;
  machineId: string;
  lastSeen: Date;
}

export interface NetworkStatus {
  pollbooks: Array<Pick<PollBookService, 'machineId' | 'lastSeen'>>;
}

export interface DeviceStatuses {
  battery?: BatteryInfo;
  printer: PrinterStatus;
  usbDrive: UsbDriveStatus;
  network: {
    pollbooks: Array<Pick<PollBookService, 'machineId' | 'lastSeen'>>;
  };
}
