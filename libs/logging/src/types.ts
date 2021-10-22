import { CardDataTypes, Dictionary } from '@votingworks/types';
import { LogEventId, LogEventType } from '.';

export enum LogDispositionStandardTypes {
  Success = 'success',
  Failure = 'failure',
  NotApplicable = 'na',
}

export type LoggingUserRole = CardDataTypes | 'vx-employee' | 'system';
export type LogDisposition = LogDispositionStandardTypes | string;
export enum LogSource {
  System = 'system',
  VxAdminApp = 'vx-admin',
}

export interface LogLine extends Dictionary<string> {
  source: LogSource;
  eventId: LogEventId;
  eventType: LogEventType;
  user: LoggingUserRole;
  disposition: LogDisposition;
  message?: string;
  time?: string;
}
