import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { find, sleep } from '@votingworks/basics';
import { Workspace } from './workspace';
import votersJson from './voters.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const voters: Voter[] = votersJson as any;

export type VoterIdentificationMethod =
  | {
      type: 'id';
    }
  | {
      type: 'challengedVoterAffidavit';
    }
  | {
      type: 'outOfStateDriversLicense';
      state: string;
    }
  | {
      type: 'personalRecognizance';
      recognizer: 'supervisor' | 'moderator' | 'cityClerk';
    };

export interface VoterCheckIn {
  identificationMethod: VoterIdentificationMethod;
  timestamp: string;
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

const MAX_VOTER_SEARCH_RESULTS = 20;

function buildApi(workspace: Workspace) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { store } = workspace;

  return grout.createApi({
    searchVoters(input: {
      searchParams: VoterSearchParams;
    }): Voter[] | number | null {
      const { searchParams } = input;
      if (Object.values(searchParams).every((value) => value === '')) {
        return null;
      }

      const matchingVoters = voters.filter(
        (voter) =>
          voter.lastName
            .toUpperCase()
            .startsWith(searchParams.lastName.toUpperCase()) &&
          voter.firstName
            .toUpperCase()
            .startsWith(searchParams.firstName.toUpperCase())
      );
      if (matchingVoters.length > MAX_VOTER_SEARCH_RESULTS) {
        return matchingVoters.length;
      }
      return matchingVoters;
    },

    async checkInVoter(input: {
      voterId: string;
      identificationMethod: VoterIdentificationMethod;
    }): Promise<boolean> {
      const voter = find(voters, ({ voterId }) => voterId === input.voterId);
      voter.checkIn = {
        timestamp: new Date().toISOString(),
        identificationMethod: input.identificationMethod,
      };

      // TODO print voter receipt
      await sleep(2000);

      return true; // Successfully checked in and printed receipt
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(workspace: Workspace): Application {
  const app: Application = express();
  const api = buildApi(workspace);
  app.use('/api', grout.buildRouter(api, express));
  app.use(express.static(workspace.assetDirectoryPath));
  return app;
}
