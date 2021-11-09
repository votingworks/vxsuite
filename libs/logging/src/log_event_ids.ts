import { throwIllegalValue } from '@votingworks/utils';
import { LogEventType } from './log_event_types';

/**
 * In order to add a new log event you must do three things:
 * 1. Add the new event to the enum LogEventId
 * 2. Define a LogDetails object representing the information about that log event.
 * 3. Add a case statement to the switch in getDetailsForEventId returning your new LogDetails object when you see your new LogEventId.
 * You will then be ready to use the log event from your code!
 */

export enum LogEventId {
  // Election configuration logs
  ElectionConfigured = 'election-configured',
  ElectionUnconfigured = 'election-unconfigured',
  // System level logs
  MachineBootInit = 'machine-boot-init',
  MachineBootComplete = 'machine-boot-complete',
  MachineShutdownInit = 'machine-shutdown-init',
  MachineShutdownComplete = 'machine-shutdown-complete',
  UsbDeviceChangeDetected = 'usb-device-change-detected',
  // Authentication related logs
  AdminAuthenticationTwoFactor = 'admin-authentication-2fac',
  MachineLocked = 'machine-locked',
  AdminCardInserted = 'admin-card-inserted',
  UserSessionActivationAttempt = 'user-session-activation',
  UserLoggedOut = 'user-logged-out',
  // USB related logs
  UsbDriveStatusUpdate = 'usb-drive-status-update',
  UsbDriveEjectInit = 'usb-drive-eject-init',
  UsbDriveEjected = 'usb-drive-eject-complete',
  UsbDriveMountInit = 'usb-drive-mount-init',
  UsbDriveMounted = 'usb-drive-mount-complete',
  // App Startup
  ApplicationStartup = 'application-startup',
  // External Device Related Logs
  PrinterConfigurationAdded = 'printer-config-added',
  PrinterConfigurationRemoved = 'printer-config-removed',
  PrinterConnectionUpdate = 'printer-connection-update',
  DeviceAttached = 'device-attached',
  DeviceUnattached = 'device-unattached',
  // Storage logs
  LoadFromStorage = 'load-from-storage',
  SaveToStorage = 'save-to-storage',
  FileSaved = 'file-saved',
  // VxAdmin specific user action logs
  ExportBallotPackageInit = 'export-ballot-package-init',
  ExportBallotPackageComplete = 'export-ballot-package-complete',
  BallotPrinted = 'ballot-printed',
  PrintedBallotReportPrinted = 'printed-ballot-report-printed',
  SmartcardProgramInit = 'smartcard-program-init',
  SmartcardProgrammed = 'smartcard-programmed',
  SmartcardProgrammedOverrideWriteProtection = 'smartcard-programmed-override-write-protection',
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

const UsbDriveEjectInit: LogDetails = {
  eventId: LogEventId.UsbDriveEjectInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A request to eject the current USB drive was given by the user, the usb drive will now be ejected.',
  defaultMessage:
    'The current USB drive was requested to eject, application will now eject...',
};

const UsbDriveEjected: LogDetails = {
  eventId: LogEventId.UsbDriveEjected,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'The current USB drive finished attempting to ejected. Success or failure indicated by disposition.',
};

const UsbDriveStatusUpdate: LogDetails = {
  eventId: LogEventId.UsbDriveStatusUpdate,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'USB Drive detected a status update. Potential USB statuses are: notavailable - No USB Drive detection is available, absent - No USB identified, present - USB identified but not mounted, mounted - USB mounted on device, ejecting - USB in the process of ejecting. ',
};

const UsbDriveMountInit: LogDetails = {
  eventId: LogEventId.UsbDriveMountInit,
  eventType: LogEventType.ApplicationAction,
  documentationMessage:
    'The USB Drive is attempting to mount. This action is taken automatically by the application when a new USB drive is detected.',
  defaultMessage:
    'The USB Drive is attempting to mount. This action is taken automatically by the application when a new USB drive is detected.',
};

const UsbDriveMounted: LogDetails = {
  eventId: LogEventId.UsbDriveMounted,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'USB Drive mount has completed. Success or failure is indicated by the disposition.',
};

const UsbDeviceChangeDetected: LogDetails = {
  eventId: LogEventId.UsbDeviceChangeDetected,
  eventType: LogEventType.SystemStatus,
  documentationMessage:
    'A message from the machine kernel about an externally-connected USB device, usually when a new device is connected or disconnected.',
};

const ApplicationStartup: LogDetails = {
  eventId: LogEventId.ApplicationStartup,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Application finished starting up, success or failure indicated by disposition.',
};

const PrinterConfigurationAdded: LogDetails = {
  eventId: LogEventId.PrinterConfigurationAdded,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Application saw a printer configuration added to the system, current connection status of that printer is logged.',
};

const PrinterConfigurationRemoved: LogDetails = {
  eventId: LogEventId.PrinterConfigurationRemoved,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Application saw a printer configuration removed from the system.',
};

const PrinterConnectionUpdate: LogDetails = {
  eventId: LogEventId.PrinterConnectionUpdate,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Application saw a change to the connection status of a given configured printer.',
};

const DeviceAttached: LogDetails = {
  eventId: LogEventId.DeviceAttached,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'Application saw a device attached to the system.',
};

const DeviceUnattached: LogDetails = {
  eventId: LogEventId.DeviceUnattached,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'Application saw a device unattached from the system.',
};

const LoadFromStorage: LogDetails = {
  eventId: LogEventId.LoadFromStorage,
  eventType: LogEventType.ApplicationAction,
  documentationMessage:
    'A piece of information (current election, imported CVR files, etc.) is loaded from storage. May happen as an automated action when an application starts up, or as a result of a user action.',
};
const SaveToStorage: LogDetails = {
  eventId: LogEventId.SaveToStorage,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A piece of information is saved to storage, usually resulting from a user action for example a user importing CVR files results in those files being saved to storage.',
};

const ExportBallotPackageInit: LogDetails = {
  eventId: LogEventId.ExportBallotPackageInit,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Exporting the ballot package is initiated.',
  defaultMessage: 'User initiated exporting the ballot package...',
};
const ExportBallotPackageComplete: LogDetails = {
  eventId: LogEventId.ExportBallotPackageComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Exporting the ballot package completed, success or failure is indicated by the disposition.',
};

const BallotPrinted: LogDetails = {
  eventId: LogEventId.BallotPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'One or more copies of a ballot were printed. Success or failure indicated by the disposition. Precinct, ballot style, ballot type, number of copies and other details included in log data.',
};
const PrintedBallotReportPrinted: LogDetails = {
  eventId: LogEventId.PrintedBallotReportPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Report of all printed ballots was printed. Success or failure indicated by the disposition.',
};

const FileSaved: LogDetails = {
  eventId: LogEventId.FileSaved,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'File is saved to a USB drive. Success or failure indicated by disposition. Type of file specified with "fileType" key. For success logs the saved filename specified with "filename" key.',
};

const SmartcardProgramInit: LogDetails = {
  eventId: LogEventId.SmartcardProgramInit,
  eventType: LogEventType.UserAction,
  documentationMessage: 'A write to smartcard is being initiated.',
};
const SmartcardProgrammed: LogDetails = {
  eventId: LogEventId.SmartcardProgrammed,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Smartcard is programmed for a new user type. User type is indicated by the programmedUser key. Success or failure is indicated by the disposition.',
};
const SmartcardProgrammedOverrideWriteProtection: LogDetails = {
  eventId: LogEventId.SmartcardProgrammedOverrideWriteProtection,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Smartcard is programmed to override a flag protecting writes on the card. By default admin cards can not be written unless write protection is first overridden.',
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
    case LogEventId.UsbDriveEjectInit:
      return UsbDriveEjectInit;
    case LogEventId.UsbDriveEjected:
      return UsbDriveEjected;
    case LogEventId.UsbDriveStatusUpdate:
      return UsbDriveStatusUpdate;
    case LogEventId.UsbDriveMountInit:
      return UsbDriveMountInit;
    case LogEventId.UsbDriveMounted:
      return UsbDriveMounted;
    case LogEventId.UsbDeviceChangeDetected:
      return UsbDeviceChangeDetected;
    case LogEventId.ApplicationStartup:
      return ApplicationStartup;
    case LogEventId.PrinterConfigurationAdded:
      return PrinterConfigurationAdded;
    case LogEventId.PrinterConfigurationRemoved:
      return PrinterConfigurationRemoved;
    case LogEventId.PrinterConnectionUpdate:
      return PrinterConnectionUpdate;
    case LogEventId.DeviceAttached:
      return DeviceAttached;
    case LogEventId.DeviceUnattached:
      return DeviceUnattached;
    case LogEventId.SaveToStorage:
      return SaveToStorage;
    case LogEventId.LoadFromStorage:
      return LoadFromStorage;
    case LogEventId.ExportBallotPackageInit:
      return ExportBallotPackageInit;
    case LogEventId.ExportBallotPackageComplete:
      return ExportBallotPackageComplete;
    case LogEventId.BallotPrinted:
      return BallotPrinted;
    case LogEventId.PrintedBallotReportPrinted:
      return PrintedBallotReportPrinted;
    case LogEventId.FileSaved:
      return FileSaved;
    case LogEventId.SmartcardProgrammed:
      return SmartcardProgrammed;
    case LogEventId.SmartcardProgrammedOverrideWriteProtection:
      return SmartcardProgrammedOverrideWriteProtection;
    case LogEventId.SmartcardProgramInit:
      return SmartcardProgramInit;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(eventId);
  }
}
