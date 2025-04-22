import { type AppName } from './log_event_enums';

// The base interface for LogEventDetails. Implementers are expected to overwrite `eventId`.
export interface BaseLogEventDetails {
  eventId: never;
  eventType: string;
  defaultMessage?: string;
  documentationMessage: string;
  // Only includes the log in the documentation file for the given apps; if not specified, it will be included in all apps' documentation.
  restrictInDocumentationToApps?: AppName[];
}
