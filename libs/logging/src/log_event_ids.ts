import { throwIllegalValue } from '@votingworks/utils';
import { LogEventType } from './log_event_types';
import { LogSource } from './log_source';

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
  DownloadedScanImageBackup = 'download-backup-scan-images',
  ConfigureFromBallotPackageInit = 'configure-from-ballot-package-init',
  BallotPackageFilesReadFromUsb = 'ballot-package-files-read-from-usb',
  BallotPackagedLoadedFromUsb = 'ballot-package-load-from-usb-complete',
  BallotConfiguredOnMachine = 'ballot-configure-machine-complete',
  ScannerConfigured = 'scanner-configure-complete',
  ExportCvrInit = 'export-cvr-init',
  ExportCvrComplete = 'export-cvr-complete',
  DeleteScanBatchInit = 'delete-cvr-batch-init',
  DeleteScanBatchComplete = 'delete-cvr-batch-complete',
  ScanBatchInit = 'scan-batch-init',
  ScanSheetComplete = 'scan-sheet-complete',
  ScanBatchComplete = 'scan-batch-complete',
  ScanBatchContinue = 'scan-batch-continue',
  ScanAdjudicationInfo = 'scan-adjudication-info',
  ScannerConfigReloaded = 'scanner-config-reloaded',
  ExportLogFileFound = 'export-log-file-found',
  ScanServiceConfigurationMessage = 'scan-service-config',
  FujitsuScanInit = 'fujitsu-scan-init',
  FujitsuScanImageScanned = 'fujitsu-scan-sheet-scanned',
  FujitsuScanBatchComplete = 'fujitsu-scan-batch-complete',
  FujitsuScanMessage = 'fujitsu-scan-message',
  LogConversionToCdfComplete = 'convert-log-cdf-complete',
  LogConversionToCdfLogLineError = 'convert-log-cdf-log-line-error',
}

export interface LogDetails {
  eventId: LogEventId;
  eventType: LogEventType;
  defaultMessage?: string;
  documentationMessage: string;
  // Only includes the log in the documentation file for the given apps, if not specified will be included in all apps documentation.
  restrictInDocumentationToApps?: LogSource[];
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
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const ExportBallotPackageComplete: LogDetails = {
  eventId: LogEventId.ExportBallotPackageComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Exporting the ballot package completed, success or failure is indicated by the disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};

const BallotPrinted: LogDetails = {
  eventId: LogEventId.BallotPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'One or more copies of a ballot were printed. Success or failure indicated by the disposition. Precinct, ballot style, ballot type, number of copies and other details included in log data.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const PrintedBallotReportPrinted: LogDetails = {
  eventId: LogEventId.PrintedBallotReportPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Report of all printed ballots was printed. Success or failure indicated by the disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
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
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const SmartcardProgrammed: LogDetails = {
  eventId: LogEventId.SmartcardProgrammed,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Smartcard is programmed for a new user type. User type is indicated by the programmedUser key. Success or failure is indicated by the disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const SmartcardProgrammedOverrideWriteProtection: LogDetails = {
  eventId: LogEventId.SmartcardProgrammedOverrideWriteProtection,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Smartcard is programmed to override a flag protecting writes on the card. By default admin cards can not be written unless write protection is first overridden.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const CvrImported: LogDetails = {
  eventId: LogEventId.CvrImported,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User imported CVR to the machine. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const CvrFilesReadFromUsb: LogDetails = {
  eventId: LogEventId.CvrFilesReadFromUsb,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User opened import CVR modal and usb is searched for possible CVR files to import.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const RecomputingTally: LogDetails = {
  eventId: LogEventId.RecomputingTally,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'New cast vote record files seen, initiating recomputation of tally data.',
  defaultMessage: 'New cast vote record files seen, recomputing tally data...',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const RecomputedTally: LogDetails = {
  eventId: LogEventId.RecomputedTally,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Tally recomputed with new cast vote record files, success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const ExternalTallyFileImported: LogDetails = {
  eventId: LogEventId.ExternalTallyFileImported,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User imported external tally file to the machine. File type indicated by fileType key. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const ManualTallyDataEdited: LogDetails = {
  eventId: LogEventId.ManualTallyDataEdited,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User added or edited manually entered tally data to be included alongside imported Cvr files.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const MarkedTallyResultsOfficial: LogDetails = {
  eventId: LogEventId.MarkedTallyResultsOfficial,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User marked the tally results as official. This disabled importing any more cvr or other tally data files.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const RemovedTallyFile: LogDetails = {
  eventId: LogEventId.RemovedTallyFile,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The user removed Cvr, External Tally data, manually entered tally data, or all tally data. The type of file removed specified by the filetype key.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const TallyReportPrinted: LogDetails = {
  eventId: LogEventId.TallyReportPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Tally Report printed.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const TallyReportPreviewed: LogDetails = {
  eventId: LogEventId.TallyReportPreviewed,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Tally Report previewed and viewed in the app.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const ConvertingResultsToSemsFormat: LogDetails = {
  eventId: LogEventId.ConvertingResultsToSemsFormat,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Initiating conversion of tally results to SEMS file format.',
  defaultMessage: 'Converting tally results to SEMS file format...',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const TestDeckPrinted: LogDetails = {
  eventId: LogEventId.TestDeckPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User printed the test deck. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const TestDeckTallyReportPrinted: LogDetails = {
  eventId: LogEventId.TestDeckTallyReportPrinted,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User printed the test deck tally report. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
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
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};

const ClearedBallotData: LogDetails = {
  eventId: LogEventId.ClearedBallotData,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished clearing ballot data in the given application. Success or failure is indicated by the disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};

const OverridingMarkThresholds: LogDetails = {
  eventId: LogEventId.OverridingMarkThresholds,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated overriding the thresholds of when to count marks seen by the scanning module. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.',
  defaultMessage: 'User is overriding mark thresholds...',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};

const OverrodeMarkThresholds: LogDetails = {
  eventId: LogEventId.OverrodeMarkThresholds,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished overriding the thresholds of when to count marks seen by the scanning module. Success or failure is indicated by the disposition. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const DownloadedScanImageBackup: LogDetails = {
  eventId: LogEventId.DownloadedScanImageBackup,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User downloaded a backup file of the scanned ballot image files and CVRs. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};

const ConfigureFromBallotPackageInit: LogDetails = {
  eventId: LogEventId.ConfigureFromBallotPackageInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User had initiated configuring the machine from a ballot package. The ballot package will be loaded from the USB drive, each ballot will be configured, the scanner will be configured, and then the election configuration will be complete.',
  defaultMessage: 'Loading ballot package from USB and configuring machine...',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const BallotPackagedLoadedFromUsb: LogDetails = {
  eventId: LogEventId.BallotPackagedLoadedFromUsb,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The ballot package has been read from the USB drive. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const BallotConfiguredOnMachine: LogDetails = {
  eventId: LogEventId.BallotConfiguredOnMachine,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The specified ballot has been configured on the machine. Success or failure indicated by disposition. `ballotStyleId`, `precinctId` and `isLiveMode` keys specify details on the ballot configured.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const ScannerConfigured: LogDetails = {
  eventId: LogEventId.ScannerConfigured,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The final configuration steps for the scanner for the ballot package have completed. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const BallotPackageFilesReadFromUsb: LogDetails = {
  eventId: LogEventId.BallotPackageFilesReadFromUsb,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'List of ballot packages read from usb and displayed to user to import to machine.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const ExportCvrInit: LogDetails = {
  eventId: LogEventId.ExportCvrInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated exporting CVR file to the USB drive.',
  defaultMessage: 'Exporting CVR file to USB...',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const ExportCvrComplete: LogDetails = {
  eventId: LogEventId.ExportCvrComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished exporting a CVR file of all results to the USB drive. Success or failure indicated by disposition. On success, number of ballots included in CVR specified by `numberOfBallots`.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};
const DeleteScanBatchInit: LogDetails = {
  eventId: LogEventId.DeleteScanBatchInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const DeleteScanBatchComplete: LogDetails = {
  eventId: LogEventId.DeleteScanBatchComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has completed deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const ScanBatchInit: LogDetails = {
  eventId: LogEventId.ScanBatchInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The user has begun scanning a new batch of ballots. Success or failure of beginning the process of scanning indicated by disposition. Batch ID for next scanned batch indicated in batchId.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const ScanSheetComplete: LogDetails = {
  eventId: LogEventId.ScanSheetComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A single sheet in a batch has completed scanning. Success or failure of the scanning indicated by disposition. Ballots rejected due to being unreadable, configured for the wrong election, needed resolution, etc. marked as `failure`. Current batch specified by `batchId` and sheet in batch specified by `sheetCount`.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const ScanBatchComplete: LogDetails = {
  eventId: LogEventId.ScanBatchComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A batch of scanned sheets has finished scanning. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const ScanBatchContinue: LogDetails = {
  eventId: LogEventId.ScanBatchContinue,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Scanning continued by user after errors and/or warning stopped scanning. Log will indicate if the sheet was tabulated with warnings, or if the user indicated removing the ballot in order to continue scanning.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const ScanAdjudicationInfo: LogDetails = {
  eventId: LogEventId.ScanAdjudicationInfo,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Information about a ballot sheet that needs adjudication from the user. The possible unresolvable errors are InvalidTestModePage when a test mode ballot is seen when scanning in live mode or vice versa, InvalidElectionHashPage when a sheet for the wrong election is seen, InvalidPrecinctPage when a sheet for an invalid precinct is seen, UninterpretedHmpbPage for a HMPB ballot that could not be read properly, UnreadablePage for a sheet that is unrecognizable as either a HMPB or BMD ballot, and BlankPage for a blank sheet. Warnings that the user can choose to tabulate with a ballot include MarginalMark, Overvote, Undervote, WriteIn, UnmarkedWriteIn, and BlankBallot (a ballot where there are no votes for any contest).',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const ScannerConfigReloaded: LogDetails = {
  eventId: LogEventId.ScannerConfigReloaded,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Configuration information for the machine including the election, if the machine is in test mode, and mark threshold override values were reloaded from the backend service storing this information.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};

const ExportLogFileFound: LogDetails = {
  eventId: LogEventId.ExportLogFileFound,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'When the user is exporting logs, indicates the success/failure of finding the expected log file on the machine.',
};
const LogConversionToCdfComplete: LogDetails = {
  eventId: LogEventId.LogConversionToCdfComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The user has converted the log file to a CDF format for export. Success or failure indicated by disposition.',
};
const LogConversionToCdfLogLineError: LogDetails = {
  eventId: LogEventId.LogConversionToCdfLogLineError,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Error seen when converting a single log to the CDF format. This log line will be skipped. Disposition of this log is always failure.',
};

const ScanServiceConfigurationMessage: LogDetails = {
  eventId: LogEventId.ScanServiceConfigurationMessage,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Message from the scanning service about how it is configured while starting up.',
  restrictInDocumentationToApps: [
    LogSource.VxBatchScanFrontend,
    LogSource.VxPrecinctScanFrontend,
  ],
};

const FujitsuScanInit: LogDetails = {
  eventId: LogEventId.FujitsuScanInit,
  eventType: LogEventType.ApplicationAction,
  documentationMessage:
    'Application is initiating a new scanning batch on the fujitsu scanner.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const FujitsuScanImageScanned: LogDetails = {
  eventId: LogEventId.FujitsuScanImageScanned,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'A scanned image has returned while scanning from a fujitsu scanner, or an error was seen while scanning. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const FujitsuScanBatchComplete: LogDetails = {
  eventId: LogEventId.FujitsuScanBatchComplete,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'A batch of sheets has completed scanning on the fujitsu scanner.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
};
const FujitsuScanMessage: LogDetails = {
  eventId: LogEventId.FujitsuScanMessage,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Message from the driver handling the fujitsu scanner regarding scanning progress.',
  restrictInDocumentationToApps: [LogSource.VxBatchScanFrontend],
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
    case LogEventId.ConfigureFromBallotPackageInit:
      return ConfigureFromBallotPackageInit;
    case LogEventId.BallotPackagedLoadedFromUsb:
      return BallotPackagedLoadedFromUsb;
    case LogEventId.BallotConfiguredOnMachine:
      return BallotConfiguredOnMachine;
    case LogEventId.ScannerConfigured:
      return ScannerConfigured;
    case LogEventId.BallotPackageFilesReadFromUsb:
      return BallotPackageFilesReadFromUsb;
    case LogEventId.ExportCvrInit:
      return ExportCvrInit;
    case LogEventId.ExportCvrComplete:
      return ExportCvrComplete;
    case LogEventId.DeleteScanBatchInit:
      return DeleteScanBatchInit;
    case LogEventId.DeleteScanBatchComplete:
      return DeleteScanBatchComplete;
    case LogEventId.ScanBatchInit:
      return ScanBatchInit;
    case LogEventId.ScanSheetComplete:
      return ScanSheetComplete;
    case LogEventId.ScanBatchComplete:
      return ScanBatchComplete;
    case LogEventId.ScanBatchContinue:
      return ScanBatchContinue;
    case LogEventId.ScanAdjudicationInfo:
      return ScanAdjudicationInfo;
    case LogEventId.ScannerConfigReloaded:
      return ScannerConfigReloaded;
    case LogEventId.ExportLogFileFound:
      return ExportLogFileFound;
    case LogEventId.ScanServiceConfigurationMessage:
      return ScanServiceConfigurationMessage;
    case LogEventId.FujitsuScanInit:
      return FujitsuScanInit;
    case LogEventId.FujitsuScanMessage:
      return FujitsuScanMessage;
    case LogEventId.FujitsuScanImageScanned:
      return FujitsuScanImageScanned;
    case LogEventId.FujitsuScanBatchComplete:
      return FujitsuScanBatchComplete;
    case LogEventId.LogConversionToCdfComplete:
      return LogConversionToCdfComplete;
    case LogEventId.LogConversionToCdfLogLineError:
      return LogConversionToCdfLogLineError;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(eventId);
  }
}
