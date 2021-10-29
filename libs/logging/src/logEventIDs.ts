import { throwIllegalValue } from '@votingworks/utils';
import { LogEventType } from './logEventTypes';

/**
 * In order to add a new log event you must do three things:
 * 1. Add the new event to the enum LogEventId
 * 2. Define a LogDetails object representing the information about that log event.
 * 3. Add a case statement to the switch in getDetailsForEventId returning your new LogDetails object when you see your new LogEventId.
 * You will then be ready to use the log event from your code!
 */

export enum LogEventId {
  ElectionConfigured = 'election-configured',
  ElectionUnconfigured = 'election-unconfigured',
  MachineBootInit = 'machine-boot-init',
  MachineBootComplete = 'machine-boot-complete',
  MachineShutdownInit = 'machine-shutdown-init',
  MachineShutdownComplete = 'machine-shutdown-complete',
  // Authentication related logs
  AdminAuthenticationTwoFactor = 'admin-authentication-2fac',
  MachineLocked = 'machine-locked',
  AdminCardInserted = 'admin-card-inserted',
  UserSessionActivationAttempt = 'user-session-activation',
  UserLoggedOut = 'user-logged-out',
}

export interface LogDetails {
  eventId: LogEventId;
  eventType: LogEventType;
  defaultMessage?: string;
  documentationMessage: string;
}

const ElectionConfiguredEvent: LogDetails = {
  eventId: LogEventId.ElectionConfigured,
  eventType: LogEventType.UserAction,
  defaultMessage: 'Application has been configured for a new election.',
  documentationMessage:
    'The user has configured current machine to a new election definition.',
};

const ElectionUnconfiguredEvent: LogDetails = {
  eventId: LogEventId.ElectionUnconfigured,
  eventType: LogEventType.UserAction,
  defaultMessage:
    'Application has been unconfigured from the previous election.',
  documentationMessage:
    'The user has unconfigured current machine to remove the current election definition.',
};

const MachineBootInitEvent: LogDetails = {
  eventId: LogEventId.MachineBootInit,
  eventType: LogEventType.SystemAction,
  documentationMessage: 'The machine is beginning the boot process.',
};

const MachineBootCompleteEvent: LogDetails = {
  eventId: LogEventId.MachineBootComplete,
  eventType: LogEventType.SystemStatus,
  documentationMessage: 'The machine has completed the boot process.',
};

const MachineShutdownInitEvent: LogDetails = {
  eventId: LogEventId.MachineShutdownInit,
  eventType: LogEventType.SystemAction,
  documentationMessage:
    'The machine is beginning the shutdown process to power down or reboot, as indicated by the message.',
};

const MachineShutdownCompleteEvent: LogDetails = {
  eventId: LogEventId.MachineShutdownComplete,
  eventType: LogEventType.SystemStatus,
  documentationMessage:
    'The machine has completed all the steps to shutdown and will now power down or reboot.',
};

const AdminAuthenticationTwoFactorEvent: LogDetails = {
  eventId: LogEventId.AdminAuthenticationTwoFactor,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Attempt to authenticate an admin user session with a passcode.',
};

const AdminCardInsertedEvent: LogDetails = {
  eventId: LogEventId.AdminCardInserted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Admin smartcard inserted, the user will be prompted for passcode to complete authentication.',
  defaultMessage:
    'Admin smartcard inserted, the user will be prompted for passcode to complete authentication.',
};

const MachineLockedEvent: LogDetails = {
  eventId: LogEventId.MachineLocked,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The current user was logged out and the machine was locked.',
  defaultMessage: 'The current user was logged out and the machine was locked.',
};

const UserSessionActivationAttemptEvent: LogDetails = {
  eventId: LogEventId.UserSessionActivationAttempt,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A user attempted to authenticate as a new user role, disposition and message clarify the user roles and success/failure.',
};

const UserLoggedOutEvent: LogDetails = {
  eventId: LogEventId.UserLoggedOut,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User logged out of the current session.',
  defaultMessage: 'User logged out of the current session.',
};

export function getDetailsForEventId(eventId: LogEventId): LogDetails {
  switch (eventId) {
    case LogEventId.ElectionConfigured:
      return ElectionConfiguredEvent;
    case LogEventId.ElectionUnconfigured:
      return ElectionUnconfiguredEvent;
    case LogEventId.MachineBootInit:
      return MachineBootInitEvent;
    case LogEventId.MachineBootComplete:
      return MachineBootCompleteEvent;
    case LogEventId.MachineShutdownInit:
      return MachineShutdownInitEvent;
    case LogEventId.MachineShutdownComplete:
      return MachineShutdownCompleteEvent;
    case LogEventId.AdminAuthenticationTwoFactor:
      return AdminAuthenticationTwoFactorEvent;
    case LogEventId.MachineLocked:
      return MachineLockedEvent;
    case LogEventId.AdminCardInserted:
      return AdminCardInsertedEvent;
    case LogEventId.UserSessionActivationAttempt:
      return UserSessionActivationAttemptEvent;
    case LogEventId.UserLoggedOut:
      return UserLoggedOutEvent;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(eventId);
  }
}
