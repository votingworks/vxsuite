import {
  ElectionEventLogDocumentation,
  EventIdDescription,
  EventTypeDescription,
} from '@votingworks/cdf-types-election-event-logging';
import { getDetailsForEventId, LogDetails, LogEventId } from './log_event_ids';
import {
  getDocumentationForEventType,
  LogEventType,
  LogEventTypeDocumentation,
} from './log_event_types';
import { LogSource } from './log_source';

export function generateMarkdownDocumentationContent(): string {
  const allEventTypes: LogEventTypeDocumentation[] = Object.values(
    LogEventType
  ).map((eventType) => getDocumentationForEventType(eventType));
  const allEventIdsForDevice: LogDetails[] = Object.values(LogEventId).map(
    (eventId) => getDetailsForEventId(eventId)
  );
  return `
# VotingWorks Log Documentation
## Event Types
Types are logged with each log line to categorize the log.
${allEventTypes
  .map(
    (details) => `### ${details.eventType}
**Description:** ${details.documentationMessage}`
  )
  .join('\n')}
## Event IDs
IDs are logged with each log to identify the log being written.
${allEventIdsForDevice
  .map(
    (details) =>
      `### ${details.eventId}
**Type:** [${details.eventType}](#${details.eventType})  
**Description:** ${details.documentationMessage}  
**Machines:** ${
        details.restrictInDocumentationToApps
          ? details.restrictInDocumentationToApps.join(', ')
          : 'All'
      }`
  )
  .join('\n')}`;
}

export function generateCdfLogDocumentationFileContent(
  appType: LogSource,
  machineModel: string,
  machineManufacturer: string
): string {
  const allEventTypes: EventTypeDescription[] = Object.values(LogEventType).map(
    (eventType) => {
      const eventTypeInformation = getDocumentationForEventType(eventType);
      return {
        Description: eventTypeInformation.documentationMessage,
        Type: eventType,
      };
    }
  );
  const allEventIdsForDevice: EventIdDescription[] = Object.values(LogEventId)
    .map((eventId) => getDetailsForEventId(eventId))
    .filter(
      (eventIdDetails) =>
        eventIdDetails.restrictInDocumentationToApps === undefined ||
        eventIdDetails.restrictInDocumentationToApps.includes(appType)
    )
    .map((eventIdDetails) => {
      return {
        Id: eventIdDetails.eventId,
        Description: eventIdDetails.documentationMessage,
      };
    });
  const documentationLog: ElectionEventLogDocumentation = {
    DeviceManufacturer: machineManufacturer,
    DeviceModel: machineModel,
    EventIdDescription: allEventIdsForDevice,
    EventTypeDescription: allEventTypes,
    GeneratedDate: new Date().toISOString(),
  };
  return JSON.stringify(documentationLog);
}
