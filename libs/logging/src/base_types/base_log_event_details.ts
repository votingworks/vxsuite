import { LogEventType } from './log_event_types';
import { AppName } from './log_source';

// The base interface for LogEventDetails. Implementers are expected to overwrite `eventId`.
export interface BaseLogEventDetails {
  eventId: never;
  eventType: LogEventType;
  defaultMessage?: string;
  documentationMessage: string;
  // Only includes the log in the documentation file for the given apps; if not specified, it will be included in all apps' documentation.
  restrictInDocumentationToApps?: AppName[];
}
