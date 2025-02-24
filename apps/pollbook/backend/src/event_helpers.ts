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
  VoterNameChangeEvent,
  VoterNameChangeSchema,
  PollbookEventBase,
} from './types';

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
