import { DateWithoutTime } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import z from 'zod';
import { Api } from './app';

export interface ElectionConfiguration {
  electionName: string;
  electionDate: DateWithoutTime;
  precinctName: string;
}

export const ElectionConfigurationSchema: z.ZodSchema<
  ElectionConfiguration,
  z.ZodTypeDef,
  Omit<ElectionConfiguration, 'electionDate'> & { electionDate: string }
> = z.object({
  electionName: z.string(),
  electionDate: z
    .string()
    .date()
    .transform((date) => new DateWithoutTime(date)),
  precinctName: z.string(),
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
  election: ElectionConfiguration;
  voters: Voter[];
}

export interface PollBookService {
  apiClient: grout.Client<Api>;
  machineId: string;
  lastSeen: Date;
}
