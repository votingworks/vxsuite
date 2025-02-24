import { DateWithoutTime } from '@votingworks/basics';
import { ElectionId } from '@votingworks/types';
import { HlcTimestamp } from './hybrid_logical_clock';
import { Store } from './store';
import {
  Voter,
  VoterCheckInEvent,
  EventType,
  PollbookEventBase,
  Election,
} from './types';

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
    streetNumber: '',
    addressSuffix: '',
    houseFractionNumber: '',
    streetName: '',
    state: '',
    apartmentUnitNumber: '',
    addressLine2: '',
    addressLine3: '',
    postalCityTown: '',
    postalZip5: '',
    zip4: '',
    mailingStreetNumber: '',
    mailingSuffix: '',
    mailingHouseFractionNumber: '',
    mailingStreetName: '',
    mailingApartmentUnitNumber: '',
    mailingAddressLine2: '',
    mailingAddressLine3: '',
    mailingCityTown: '',
    mailingState: '',
    mailingZip5: '',
    mailingZip4: '',
    party: 'UND',
    district: '',
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
    id: 'test-election' as ElectionId,
    title: 'Test Election',
    date: new DateWithoutTime('2024-01-01'),
    precincts: [],
    county: {
      id: 'test-county',
      name: 'Test County',
    },
    state: 'VX',
    seal: 'test-seal-contents',
  };
  return testElection;
}
