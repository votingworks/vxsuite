import { EventLogging } from '@votingworks/types';
import { getDetailsForEventId, LogDetails, LogEventId } from './log_event_ids';
import {
  getDocumentationForEventType,
  LogEventType,
  LogEventTypeDocumentation,
} from './base_types/log_event_types';
import { AppName } from './base_types/log_source';

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
  appType: AppName,
  machineModel: string,
  machineManufacturer: string
): string {
  const allEventTypes: EventLogging.EventTypeDescription[] = Object.values(
    LogEventType
  ).map((eventType) => {
    const eventTypeInformation = getDocumentationForEventType(eventType);
    return {
      '@type': 'EventLogging.EventTypeDescription',
      Description: eventTypeInformation.documentationMessage,
      Type: eventType,
    };
  });
  const allEventIdsForDevice: EventLogging.EventIdDescription[] = Object.values(
    LogEventId
  )
    .map((eventId) => getDetailsForEventId(eventId))
    .filter(
      (eventIdDetails) =>
        eventIdDetails.restrictInDocumentationToApps === undefined ||
        eventIdDetails.restrictInDocumentationToApps.includes(appType)
    )
    .map((eventIdDetails) => ({
      '@type': 'EventLogging.EventIdDescription',
      Id: eventIdDetails.eventId,
      Description: eventIdDetails.documentationMessage,
    }));
  const documentationLog: EventLogging.ElectionEventLogDocumentation = {
    '@type': 'EventLogging.ElectionEventLogDocumentation',
    DeviceManufacturer: machineManufacturer,
    DeviceModel: machineModel,
    EventIdDescription: allEventIdsForDevice,
    EventTypeDescription: allEventTypes,
    GeneratedDate: new Date().toISOString(),
  };
  return JSON.stringify(documentationLog);
}
