import { throwIllegalValue } from '@votingworks/utils';

/**
 * In order to add a new log event type you must do three things:
 * 1. Add the new event type to the enum LogEventType
 * 2. Define a LogEventTypeDocumentation object with documentation about the meaning of the event type. This will be available publicly with the intended audience of users understanding the logs.
 * 3. Add a case statement to the switch in getDocumentationForEventType returning your new LogEventTypeDocumentation object when you see the event type.
 * You will then be ready to use this event type when defining log event Ids!
 */

export enum LogEventType {
  UserAction = 'user-action',
  SystemAction = 'system-action',
  SystemStatus = 'system-status',
}

export interface LogEventTypeDocumentation {
  eventType: LogEventType;
  documentationMessage: string;
}

const UserActionEventDocumentation: LogEventTypeDocumentation = {
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A log that results from a user taking an action, i.e. an election admin uploading an election definition to a machine.',
};

const SystemActionEventDocumentation: LogEventTypeDocumentation = {
  eventType: LogEventType.SystemAction,
  documentationMessage:
    'A log that results from the system taking some action, i.e. the machine booting.',
};

const SystemStatusEventDocumentation: LogEventTypeDocumentation = {
  eventType: LogEventType.SystemStatus,
  documentationMessage:
    'A log that results from the system updating on the status of a process it is running, i.e. completion of machine shutdown or boot.',
};

export function getDocumentationForEventType(
  eventType: LogEventType
): LogEventTypeDocumentation {
  switch (eventType) {
    case LogEventType.UserAction:
      return UserActionEventDocumentation;
    case LogEventType.SystemAction:
      return SystemActionEventDocumentation;
    case LogEventType.SystemStatus:
      return SystemStatusEventDocumentation;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(eventType);
  }
}
