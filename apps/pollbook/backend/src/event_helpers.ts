import { typedAs, throwIllegalValue } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
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
} from './types';

export function convertDbRowsToPollbookEvents(
  rows: EventDbRow[]
): PollbookEvent[] {
  return rows
    .map((event) => {
      switch (event.event_type) {
        case EventType.VoterCheckIn: {
          return typedAs<VoterCheckInEvent>({
            type: EventType.VoterCheckIn,
            localEventId: event.event_id,
            machineId: event.machine_id,
            voterId: event.voter_id,
            timestamp: {
              physical: event.physical_time,
              logical: event.logical_counter,
              machineId: event.machine_id,
            },
            checkInData: safeParseJson(
              event.event_data,
              VoterCheckInSchema
            ).unsafeUnwrap(),
          });
        }
        case EventType.UndoVoterCheckIn: {
          return typedAs<UndoVoterCheckInEvent>({
            type: EventType.UndoVoterCheckIn,
            localEventId: event.event_id,
            machineId: event.machine_id,
            voterId: event.voter_id,
            timestamp: {
              physical: event.physical_time,
              logical: event.logical_counter,
              machineId: event.machine_id,
            },
          });
        }
        case EventType.VoterAddressChange:
          return typedAs<VoterAddressChangeEvent>({
            type: EventType.VoterAddressChange,
            localEventId: event.event_id,
            machineId: event.machine_id,
            voterId: event.voter_id,
            timestamp: {
              physical: event.physical_time,
              logical: event.logical_counter,
              machineId: event.machine_id,
            },
            addressChangeData: safeParseJson(
              event.event_data,
              VoterAddressChangeSchema
            ).unsafeUnwrap(),
          });
        case EventType.VoterRegistration:
          return typedAs<VoterRegistrationEvent>({
            type: EventType.VoterRegistration,
            localEventId: event.event_id,
            machineId: event.machine_id,
            voterId: event.voter_id,
            timestamp: {
              physical: event.physical_time,
              logical: event.logical_counter,
              machineId: event.machine_id,
            },
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
