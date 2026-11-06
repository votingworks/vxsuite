import {
  type Dictionary,
  EventLogging,
  type UserRole,
} from '@votingworks/types';
import { z } from 'zod/v4';
import type { EnumValues } from '@votingworks/basics';
import {
  AppName,
  type LogEventId,
  type LogEventType,
  LogSource,
} from './log_event_enums.js';

export const LogDispositionStandardTypes = {
  Success: 'success',
  Failure: 'failure',
  NotApplicable: 'na',
} as const;
export type LogDispositionStandardTypes = EnumValues<
  typeof LogDispositionStandardTypes
>;

export type LoggingUserRole = UserRole | 'vx-staff' | 'system' | 'unknown';
export type LogDisposition = LogDispositionStandardTypes | string;

export interface LogLine extends Dictionary<string> {
  source: LogSource;
  eventId: LogEventId;
  eventType: LogEventType;
  user: LoggingUserRole;
  disposition: LogDisposition;
  message?: string;
  timeLogInitiated?: string;
}

export const AppNameSchema: z.ZodSchema<AppName> = z.enum(AppName);

export const DEVICE_TYPES_FOR_APP: Dictionary<EventLogging.DeviceType> = {
  [LogSource.VxAdminFrontend]: EventLogging.DeviceType.Ems,
  [LogSource.VxCentralScanFrontend]: EventLogging.DeviceType.ScanBatch,
  [LogSource.VxScanFrontend]: EventLogging.DeviceType.ScanSingle,
  [LogSource.VxMarkFrontend]: EventLogging.DeviceType.Bmd,
  [LogSource.VxBallotActivationFrontend]:
    EventLogging.DeviceType.BallotActivation,
  [LogSource.VxMarkScanFrontend]: EventLogging.DeviceType.Bmd,
  [LogSource.VxPollBookFrontend]: EventLogging.DeviceType.ElectronicPollBook,
};
