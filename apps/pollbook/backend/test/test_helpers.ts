import { DateWithoutTime } from '@votingworks/basics';
import { Election, ElectionId, HmpbBallotPaperSize } from '@votingworks/types';
import { HlcTimestamp } from '../src/hybrid_logical_clock';
import { Store } from '../src/store';
import {
  Voter,
  VoterCheckInEvent,
  EventType,
  PollbookEventBase,
  ValidStreetInfo,
} from '../src/types';

export function createVoter(
  voterId: string,
  firstName: string,
  lastName: string
): Voter {
  return {
    voterId,
    firstName,
    lastName,
    middleName: '',
    suffix: '',
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
    district: 'District',
  };
}
export function createVoterCheckInEvent(
  localEventId: number,
  machineId: string,
  voterId: string,
  hlcTimestamp: HlcTimestamp
): VoterCheckInEvent {
  const timestamp = new Date().toISOString();
  return {
    receiptNumber: 0,
    localEventId,
    type: EventType.VoterCheckIn,
    machineId,
    timestamp: hlcTimestamp,
    voterId,
    checkInData: {
      timestamp,
      identificationMethod: { type: 'default' },
      machineId,
      isAbsentee: false,
    },
  };
}

export function createValidStreetInfo(
  streetName: string,
  side: 'even' | 'odd',
  lowRange: number,
  highRange: number,
  postalCity?: string,
  zip5?: string
): ValidStreetInfo {
  return {
    streetName,
    side,
    lowRange,
    highRange,
    postalCity: postalCity || 'Manchester',
    zip5: zip5 || '03101',
    zip4: '0000',
    district: 'NH',
  };
}

export function syncEventsFromTo(from: Store, to: Store): PollbookEventBase[] {
  let keepSyncing = true;
  const allEvents: PollbookEventBase[] = [];
  while (keepSyncing) {
    const lastSyncHeads = to.getLastEventSyncedPerNode();
    const { events, hasMore } = from.getNewEvents(lastSyncHeads);
    to.saveRemoteEvents(events);
    allEvents.push(...events);
    keepSyncing = hasMore;
  }
  return allEvents;
}

export function syncEventsForAllPollbooks(pollbooks: Store[]): void {
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
    districts: [],
    precincts: Array.from({ length: 5 }, (_, i) => ({
      id: `precinct-${i}`,
      name: `Test Precinct ${i}`,
      districtIds: [],
    })),
    contests: [],
    ballotStyles: [],
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    ballotStrings: {},
  };
  return testElection;
}

export function setupTestElectionAndVoters(store: Store): void {
  const testElection = getTestElection();
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
      postalCity: 'Somewhere',
      zip5: '12345',
      zip4: '6789',
      district: 'Somewhere',
    },
  ];
  store.setElectionAndVoters(testElection, testStreetInfo, testVoters);
}
