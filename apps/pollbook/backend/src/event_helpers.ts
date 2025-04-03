import { assert, typedAs, throwIllegalValue } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import { rootDebug } from './debug';
import {
  EventDbRow,
  EventType,
  VoterCheckInEvent,
  VoterCheckInSchema,
  UndoVoterCheckInEvent,
  VoterRegistrationEvent,
  VoterRegistrationSchema,
  PollbookEvent,
  VoterAddressChangeSchema,
  VoterAddressChangeEvent,
  VoterNameChangeEvent,
  VoterNameChangeSchema,
  PollbookEventBase,
  Voter,
  VoterRegistration,
} from './types';
const debug = rootDebug.extend('store');

export function convertDbRowsToPollbookEvents(
  rows: EventDbRow[]
): PollbookEvent[] {
  return rows
    .map((event) => {
      const eventBase: Omit<PollbookEventBase, 'type'> & { voterId: string } = {
        localEventId: event.event_id,
        machineId: event.machine_id,
        voterId: event.voter_id,
        receiptNumber: event.receipt_number,
        timestamp: {
          physical: event.physical_time,
          logical: event.logical_counter,
          machineId: event.machine_id,
        },
      };
      switch (event.event_type) {
        case EventType.VoterCheckIn: {
          return typedAs<VoterCheckInEvent>({
            ...eventBase,
            type: EventType.VoterCheckIn,
            checkInData: safeParseJson(
              event.event_data,
              VoterCheckInSchema
            ).unsafeUnwrap(),
          });
        }
        case EventType.UndoVoterCheckIn: {
          return typedAs<UndoVoterCheckInEvent>({
            ...eventBase,
            type: EventType.UndoVoterCheckIn,
            reason: event.event_data,
          });
        }
        case EventType.VoterAddressChange:
          return typedAs<VoterAddressChangeEvent>({
            ...eventBase,
            type: EventType.VoterAddressChange,
            addressChangeData: safeParseJson(
              event.event_data,
              VoterAddressChangeSchema
            ).unsafeUnwrap(),
          });
        case EventType.VoterNameChange:
          return typedAs<VoterNameChangeEvent>({
            ...eventBase,
            type: EventType.VoterNameChange,
            nameChangeData: safeParseJson(
              event.event_data,
              VoterNameChangeSchema
            ).unsafeUnwrap(),
          });
        case EventType.VoterRegistration:
          return typedAs<VoterRegistrationEvent>({
            ...eventBase,
            type: EventType.VoterRegistration,
            registrationData: safeParseJson(
              event.event_data,
              VoterRegistrationSchema
            ).unsafeUnwrap(),
          });
        default:
          throwIllegalValue(event.event_type);
      }
      return undefined;
    })
    .filter((event) => !!event);
}

export function applyPollbookEventsToVoters(
  voters: Record<string, Voter>,
  orderedEvents: PollbookEvent[]
) {
  for (const event of orderedEvents) {
    switch (event.type) {
      case EventType.VoterCheckIn: {
        const voter = voters[event.voterId];
        // If we receive an event for a voter that doesn't exist, we should ignore it.
        // If we get the VoterRegistration event for that voter later, this event will get reprocessed.
        if (!voter) {
          debug('Voter %s not found', event.voterId);
          continue;
        }
        voter.checkIn = event.checkInData;
        break;
      }
      case EventType.UndoVoterCheckIn: {
        const voter = voters[event.voterId];
        if (!voter) {
          debug('Voter %s not found', event.voterId);
          continue;
        }
        voter.checkIn = undefined;
        break;
      }
      case EventType.VoterAddressChange: {
        const { voterId, addressChangeData } = event;
        voters[voterId] = {
          ...voters[voterId],
          addressChange: addressChangeData,
        };
        break;
      }
      case EventType.VoterNameChange: {
        const { voterId, nameChangeData } = event;
        voters[voterId] = {
          ...voters[voterId],
          nameChange: nameChangeData,
        };
        break;
      }
      case EventType.VoterRegistration: {
        const newVoter = createVoterFromRegistrationData(
          event.registrationData
        );
        voters[newVoter.voterId] = newVoter;
        break;
      }
      default: {
        throwIllegalValue(event, 'type');
      }
    }
  }
  return voters;
}

export function createVoterFromRegistrationData(
  registrationEvent: VoterRegistration
): Voter {
  assert(registrationEvent.voterId !== undefined);
  return {
    voterId: registrationEvent.voterId,
    firstName: registrationEvent.firstName,
    lastName: registrationEvent.lastName,
    streetNumber: registrationEvent.streetNumber,
    streetName: registrationEvent.streetName,
    postalCityTown: registrationEvent.city,
    state: registrationEvent.state,
    postalZip5: registrationEvent.zipCode,
    party: registrationEvent.party,
    suffix: registrationEvent.suffix,
    middleName: registrationEvent.middleName,
    addressSuffix: registrationEvent.streetSuffix,
    houseFractionNumber: registrationEvent.houseFractionNumber,
    apartmentUnitNumber: registrationEvent.apartmentUnitNumber,
    addressLine2: registrationEvent.addressLine2,
    addressLine3: registrationEvent.addressLine3,
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
    district: registrationEvent.district || '',
    registrationEvent,
  };
}
