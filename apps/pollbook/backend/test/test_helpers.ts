import { DateWithoutTime } from '@votingworks/basics';
import {
  BallotStyleGroupId,
  BallotStyleId,
  DistrictId,
  Election,
  ElectionDefinition,
  ElectionId,
  HmpbBallotPaperSize,
  ValidStreetInfo,
  PartyAbbreviation,
  Voter,
} from '@votingworks/types';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { BaseLogger } from '@votingworks/logging';
import { HlcTimestamp } from '../src/hybrid_logical_clock';
import { Store } from '../src/store';
import {
  VoterCheckInEvent,
  UndoVoterCheckInEvent,
  EventType,
  PollbookEventBase,
} from '../src/types';
import { PeerStore } from '../src/peer_store';

interface OptionalMockVoterParams {
  middleName?: string;
  suffix?: string;
  precinct?: string;
  party?: PartyAbbreviation;
  emptyMailingAddress?: boolean;
}

export function createVoter(
  voterId: string,
  firstName: string,
  lastName: string,
  optionalMockVoterParams: OptionalMockVoterParams = {}
): Voter {
  return {
    voterId,
    firstName,
    lastName,
    middleName: optionalMockVoterParams.middleName || '',
    suffix: optionalMockVoterParams.suffix || '',
    streetNumber: '123',
    addressSuffix: '',
    houseFractionNumber: '',
    streetName: 'Main St',
    state: 'NH',
    apartmentUnitNumber: '',
    addressLine2: 'line 2',
    addressLine3: '',
    postalCityTown: 'Somewhere',
    postalZip5: '12345',
    zip4: '6789',
    mailingStreetNumber: optionalMockVoterParams.emptyMailingAddress
      ? ''
      : '123',
    mailingSuffix: optionalMockVoterParams.emptyMailingAddress ? '' : 'A',
    mailingHouseFractionNumber: '',
    mailingStreetName: optionalMockVoterParams.emptyMailingAddress
      ? ''
      : 'Main St',
    mailingApartmentUnitNumber: '',
    mailingAddressLine2: '',
    mailingAddressLine3: '',
    mailingCityTown: optionalMockVoterParams.emptyMailingAddress
      ? ''
      : 'Somewhere',
    mailingState: optionalMockVoterParams.emptyMailingAddress ? '' : 'NH',
    mailingZip5: optionalMockVoterParams.emptyMailingAddress ? '' : '12345',
    mailingZip4: optionalMockVoterParams.emptyMailingAddress ? '' : '6789',
    party: optionalMockVoterParams.party || 'UND',
    precinct: optionalMockVoterParams.precinct || 'Precinct',
    isInactive: false,
  };
}

export function createVoterCheckInEvent(
  receiptNumber: number,
  machineId: string,
  voterId: string,
  hlcTimestamp: HlcTimestamp
): VoterCheckInEvent {
  const match = voterId.match(/voter-([0-9]+)/);
  let ballotParty: PartyAbbreviation;
  if (!match) {
    // eslint-disable-next-line no-console
    console.warn(
      'Unexpected voter ID format may result in uneven distribution of declared party in check-ins'
    );
    ballotParty = 'DEM';
  } else {
    const idNumber = Number.parseInt(match[0], 10);
    ballotParty = idNumber % 2 === 0 ? 'DEM' : 'REP';
  }

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
      ballotParty,
    },
  };
}

export function createUndoCheckInEvent(
  receiptNumber: number,
  machineId: string,
  voterId: string,
  hlcTimestamp: HlcTimestamp,
  reason: string = 'Test undo'
): UndoVoterCheckInEvent {
  return {
    type: EventType.UndoVoterCheckIn,
    machineId,
    receiptNumber,
    timestamp: hlcTimestamp,
    voterId,
    reason,
  };
}

export function createValidStreetInfo(
  streetName: string,
  side: 'even' | 'odd' | 'all',
  lowRange: number,
  highRange: number,
  postalCityTown?: string,
  zip5?: string,
  precinctId: string = 'precinct-1'
): ValidStreetInfo {
  return {
    streetName,
    side,
    lowRange,
    highRange,
    postalCityTown: postalCityTown || 'Manchester',
    zip5: zip5 || '03101',
    zip4: '0000',
    precinct: precinctId,
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

interface SetupTestElectionAndVotersOptions {
  electionDefinition?: ElectionDefinition;
  precinct?: string;
  additionalVoters?: Voter[];
}

export function setupTestElectionAndVoters(
  store: Store,
  options: SetupTestElectionAndVotersOptions = {}
): void {
  const testVoters = [
    createVoter('abigail', 'Abigail', 'Adams', { precinct: options.precinct }),
    createVoter('bob', 'Bob', 'Smith', { precinct: options.precinct }),
    createVoter('charlie', 'Charlie', 'Brown', { precinct: options.precinct }),
    createVoter('sue', 'Sue', 'Jones', { precinct: options.precinct }),
    ...(options.additionalVoters ?? []),
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
      precinct: 'precinct-1',
    },
  ];
  store.setElectionAndVoters(
    options.electionDefinition ?? getTestElectionDefinition(),
    'mock-package-hash',
    testStreetInfo,
    testVoters
  );
}

interface CreateTestPeerStoreOptions {
  machineId?: string;
  voterCount?: number;
}

/**
 * Creates a memory-backed PeerStore with test voters for unit testing.
 */
export function createTestPeerStore(
  logger: BaseLogger,
  options: CreateTestPeerStoreOptions = {}
): PeerStore {
  const { machineId = 'test-machine', voterCount = 10 } = options;
  const store = PeerStore.memoryStore(logger, machineId);
  const voters = Array.from({ length: voterCount }, (_, i) =>
    createVoter(`voter-${i}`, `FirstName${i}`, `LastName${i}`)
  );
  const testElection = getTestElectionDefinition();
  store.setElectionAndVoters(testElection, 'mock-package-hash', [], voters);
  store.setConfiguredPrecinct(testElection.election.precincts[0].id);
  return store;
}
