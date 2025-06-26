import { DateWithoutTime } from '@votingworks/basics';
import {
  BallotStyleGroupId,
  BallotStyleId,
  DistrictId,
  Election,
  ElectionDefinition,
  ElectionId,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { HlcTimestamp } from '../src/hybrid_logical_clock';
import { Store } from '../src/store';
import {
  Voter,
  VoterCheckInEvent,
  EventType,
  PollbookEventBase,
  ValidStreetInfo,
} from '../src/types';
import { PeerStore } from '../src/peer_store';

export function createVoter(
  voterId: string,
  firstName: string,
  lastName: string,
  middleName: string = '',
  suffix: string = ''
): Voter {
  return {
    voterId,
    firstName,
    lastName,
    middleName,
    suffix,
    streetNumber: '123',
    addressSuffix: '',
    houseFractionNumber: '',
    streetName: 'Main St',
    state: 'NH',
    apartmentUnitNumber: '',
    addressLine2: 'line 2',
    addressLine3: '',
    postalCityTown: '',
    postalZip5: '12345',
    zip4: '6789',
    mailingStreetNumber: '123',
    mailingSuffix: 'APT A',
    mailingHouseFractionNumber: '',
    mailingStreetName: 'Main St',
    mailingApartmentUnitNumber: '',
    mailingAddressLine2: '',
    mailingAddressLine3: '',
    mailingCityTown: 'Somewhere',
    mailingState: 'NH',
    mailingZip5: '12345',
    mailingZip4: '6789',
    party: 'UND',
    precinct: 'Precinct',
    isInactive: false,
  };
}
export function createVoterCheckInEvent(
  receiptNumber: number,
  machineId: string,
  voterId: string,
  hlcTimestamp: HlcTimestamp
): VoterCheckInEvent {
  const timestamp = new Date().toISOString();
  return {
    receiptNumber,
    type: EventType.VoterCheckIn,
    machineId,
    timestamp: hlcTimestamp,
    voterId,
    checkInData: {
      timestamp,
      identificationMethod: { type: 'default' },
      machineId,
      isAbsentee: false,
      receiptNumber,
    },
  };
}

export function createValidStreetInfo(
  streetName: string,
  side: 'even' | 'odd' | 'all',
  lowRange: number,
  highRange: number,
  postalCityTown?: string,
  zip5?: string
): ValidStreetInfo {
  return {
    streetName,
    side,
    lowRange,
    highRange,
    postalCityTown: postalCityTown || 'Manchester',
    zip5: zip5 || '03101',
    zip4: '0000',
    precinct: '1',
  };
}

export function syncEventsFromTo(
  from: PeerStore,
  to: PeerStore
): PollbookEventBase[] {
  let keepSyncing = true;
  const allEvents: PollbookEventBase[] = [];
  while (keepSyncing) {
    const lastSyncHeads = to.getMostRecentEventIdPerMachine();
    const { events, hasMore } = from.getNewEvents(lastSyncHeads);
    try {
      suppressingConsoleOutput(() => {
        to.saveRemoteEvents(events, from.getPollbookConfigurationInformation());
      });
      allEvents.push(...events);
      keepSyncing = hasMore;
    } catch (error) {
      break;
    }
  }
  return allEvents;
}

export function syncEventsForAllPollbooks(pollbooks: PeerStore[]): void {
  for (const from of pollbooks) {
    for (const to of pollbooks) {
      if (from !== to) {
        syncEventsFromTo(from, to);
      }
    }
  }
}

export function getTestElection(): Election {
  const testElection: Election = {
    id: 'test-election-id' as ElectionId,
    state: 'Test State',
    county: {
      id: 'test-county',
      name: 'Test County',
    },
    title: 'Test Election',
    type: 'general',
    date: new DateWithoutTime('2024-01-01'),
    seal: '',
    parties: [],
    districts: [
      {
        id: 'ds-1' as DistrictId,
        name: 'district 1',
      },
    ],
    precincts: Array.from({ length: 5 }, (_, i) => ({
      id: `precinct-${i}`,
      name: `Test Precinct ${i}`,
      districtIds: [],
    })),
    contests: [],
    ballotStyles: [
      {
        id: 'bs-1' as BallotStyleId,
        groupId: 'bs-1' as BallotStyleGroupId,
        precincts: [],
        districts: [],
      },
    ],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
  return testElection;
}

export function getTestElectionDefinition(): ElectionDefinition {
  const testElectionDefinition: ElectionDefinition = {
    election: getTestElection(),
    electionData: '',
    ballotHash: 'test-ballot-hash',
  };
  return testElectionDefinition;
}

export function setupTestElectionAndVoters(store: Store): void {
  const testElectionDefinition = getTestElectionDefinition();
  const testVoters = [
    createVoter('abigail', 'Abigail', 'Adams'),
    createVoter('bob', 'Bob', 'Smith'),
    createVoter('charlie', 'Charlie', 'Brown'),
    createVoter('sue', 'Sue', 'Jones'),
  ];
  const testStreetInfo: ValidStreetInfo[] = [
    {
      streetName: 'Main',
      side: 'even',
      lowRange: 2,
      highRange: 100,
      postalCityTown: 'Somewhere',
      zip5: '12345',
      zip4: '6789',
      precinct: 'Somewhere',
    },
  ];
  store.setElectionAndVoters(
    testElectionDefinition,
    'mock-package-hash',
    testStreetInfo,
    testVoters
  );
}
