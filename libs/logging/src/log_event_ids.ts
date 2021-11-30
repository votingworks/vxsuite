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
  CvrImported = 'cvr-imported',
  CvrFilesReadFromUsb = 'cvr-files-read-from-usb',
  RecomputingTally = 'recompute-tally-init',
  RecomputedTally = 'recompute-tally-complete',
  ExternalTallyFileImported = 'external-tally-file-imported',
  ManualTallyDataEdited = 'manual-tally-data-edited',
  MarkedTallyResultsOfficial = 'marked-tally-results-official',
  RemovedTallyFile = 'removed-tally-file',
  TallyReportPreviewed = 'tally-report-previewed',
  TallyReportPrinted = 'tally-report-printed',
  ConvertingResultsToSemsFormat = 'converting-to-sems',
  TestDeckPrinted = 'test-deck-printed',
  TestDeckTallyReportPrinted = 'test-deck-tally-report-printed',
  // VxBatch specific user action logs
  TogglingTestMode = 'toggle-test-mode-init',
  ToggledTestMode = 'toggled-test-mode',
  ClearingBallotData = 'clear-ballot-data-init',
  ClearedBallotData = 'clear-ballot-data-complete',
  OverridingMarkThresholds = 'override-mark-threshold-init',
  OverrodeMarkThresholds = 'override-mark-thresholds-complete',
  DownloadedScanImageBackup = 'download-backup-scan-images,',
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
    'The user has unconfigured current machine to remove the current election definition, and all other data.',
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
const CvrImported: LogDetails = {
  eventId: LogEventId.CvrImported,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User imported CVR to the machine. Success or failure indicated by disposition.',
};
const CvrFilesReadFromUsb: LogDetails = {
  eventId: LogEventId.CvrFilesReadFromUsb,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User opened import CVR modal and usb is searched for possible CVR files to import.',
};
const RecomputingTally: LogDetails = {
  eventId: LogEventId.RecomputingTally,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'New cast vote record files seen, initiating recomputation of tally data.',
  defaultMessage: 'New cast vote record files seen, recomputing tally data...',
};
const RecomputedTally: LogDetails = {
  eventId: LogEventId.RecomputedTally,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Tally recomputed with new cast vote record files, success or failure indicated by disposition.',
};
const ExternalTallyFileImported: LogDetails = {
  eventId: LogEventId.ExternalTallyFileImported,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User imported external tally file to the machine. File type indicated by fileType key. Success or failure indicated by disposition.',
};
const ManualTallyDataEdited: LogDetails = {
  eventId: LogEventId.ManualTallyDataEdited,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User added or edited manually entered tally data to be included alongside imported Cvr files.',
};
const MarkedTallyResultsOfficial: LogDetails = {
  eventId: LogEventId.MarkedTallyResultsOfficial,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User marked the tally results as official. This disabled importing any more cvr or other tally data files.',
};
const RemovedTallyFile: LogDetails = {
  eventId: LogEventId.RemovedTallyFile,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The user removed Cvr, External Tally data, manually entered tally data, or all tally data. The type of file removed specified by the filetype key.',
};
const TallyReportPrinted: LogDetails = {
  eventId: LogEventId.TallyReportPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Tally Report printed.',
};
const TallyReportPreviewed: LogDetails = {
  eventId: LogEventId.TallyReportPreviewed,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Tally Report previewed and viewed in the app.',
};
const ConvertingResultsToSemsFormat: LogDetails = {
  eventId: LogEventId.ConvertingResultsToSemsFormat,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Initiating conversion of tally results to SEMS file format.',
  defaultMessage: 'Converting tally results to SEMS file format...',
};
const TestDeckPrinted: LogDetails = {
  eventId: LogEventId.TestDeckPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User printed the test deck. Success or failure indicated by disposition.',
};
const TestDeckTallyReportPrinted: LogDetails = {
  eventId: LogEventId.TestDeckTallyReportPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User printed the test deck tally report. Success or failure indicated by disposition.',
};

const TogglingTestMode: LogDetails = {
  eventId: LogEventId.TogglingTestMode,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated toggling between test mode and live mode in the current application.',
};

const ToggledTestMode: LogDetails = {
  eventId: LogEventId.ToggledTestMode,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished toggling between live mode and test mode in the given application. Success or failure is indicated by the disposition.',
};

const ClearingBallotData: LogDetails = {
  eventId: LogEventId.ClearingBallotData,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated clearing ballot data in the current application.',
  defaultMessage: 'User is clearing ballot data...',
};

const ClearedBallotData: LogDetails = {
  eventId: LogEventId.ClearedBallotData,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished clearing ballot data in the given application. Success or failure is indicated by the disposition.',
};

const OverridingMarkThresholds: LogDetails = {
  eventId: LogEventId.OverridingMarkThresholds,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated overriding the thresholds of when to count marks seen by the scanning module. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.',
  defaultMessage: 'User is overriding mark thresholds...',
};

const OverrodeMarkThresholds: LogDetails = {
  eventId: LogEventId.OverrodeMarkThresholds,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished overriding the thresholds of when to count marks seen by the scanning module. Success or failure is indicated by the disposition. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.',
};
const DownloadedScanImageBackup: LogDetails = {
  eventId: LogEventId.DownloadedScanImageBackup,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User downloaded a backup file of the scanned ballot image files and CVRs. Success or failure indicated by disposition.',
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
    case LogEventId.CvrFilesReadFromUsb:
      return CvrFilesReadFromUsb;
    case LogEventId.CvrImported:
      return CvrImported;
    case LogEventId.RecomputingTally:
      return RecomputingTally;
    case LogEventId.RecomputedTally:
      return RecomputedTally;
    case LogEventId.ExternalTallyFileImported:
      return ExternalTallyFileImported;
    case LogEventId.ManualTallyDataEdited:
      return ManualTallyDataEdited;
    case LogEventId.MarkedTallyResultsOfficial:
      return MarkedTallyResultsOfficial;
    case LogEventId.RemovedTallyFile:
      return RemovedTallyFile;
    case LogEventId.TallyReportPrinted:
      return TallyReportPrinted;
    case LogEventId.TallyReportPreviewed:
      return TallyReportPreviewed;
    case LogEventId.ConvertingResultsToSemsFormat:
      return ConvertingResultsToSemsFormat;
    case LogEventId.TestDeckPrinted:
      return TestDeckPrinted;
    case LogEventId.TestDeckTallyReportPrinted:
      return TestDeckTallyReportPrinted;
    case LogEventId.TogglingTestMode:
      return TogglingTestMode;
    case LogEventId.ToggledTestMode:
      return ToggledTestMode;
    case LogEventId.ClearingBallotData:
      return ClearingBallotData;
    case LogEventId.ClearedBallotData:
      return ClearedBallotData;
    case LogEventId.OverridingMarkThresholds:
      return OverridingMarkThresholds;
    case LogEventId.OverrodeMarkThresholds:
      return OverrodeMarkThresholds;
    case LogEventId.DownloadedScanImageBackup:
      return DownloadedScanImageBackup;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(eventId);
  }
}
