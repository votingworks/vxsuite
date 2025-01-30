import { typedAs, throwIllegalValue } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import {
  EventDbRow,
  PollbookEvent,
  EventType,
  VoterCheckInEvent,
  VoterCheckInSchema,
  UndoVoterCheckInEvent,
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
        default:
          throwIllegalValue(event.event_type);
      }
      return undefined;
    })
    .filter((event) => !!event);
}
