import { throwIllegalValue } from '@votingworks/basics';
import { LogEventType } from './log_event_types';
import { LogSource } from './log_source';

/**
 * In order to add a new log event you must:
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

  // Auth logs
  AuthPinEntry = 'auth-pin-entry',
  AuthLogin = 'auth-login',
  AuthLogout = 'auth-logout',

  // USB related logs
  UsbDriveDetected = 'usb-drive-detected',
  UsbDriveRemoved = 'usb-drive-removed',
  UsbDriveEjectInit = 'usb-drive-eject-init',
  UsbDriveEjected = 'usb-drive-eject-complete',
  UsbDriveMountInit = 'usb-drive-mount-init',
  UsbDriveMounted = 'usb-drive-mount-complete',
  UsbDriveFormatInit = 'usb-drive-format-init',
  UsbDriveFormatted = 'usb-drive-format-complete',

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
  SaveBallotPackageInit = 'save-ballot-package-init',
  SaveBallotPackageComplete = 'save-ballot-package-complete',
  SmartCardProgramInit = 'smart-card-program-init',
  SmartCardProgramComplete = 'smart-card-program-complete',
  SmartCardUnprogramInit = 'smart-card-unprogram-init',
  SmartCardUnprogramComplete = 'smart-card-unprogram-complete',
  ListCastVoteRecordExportsOnUsbDrive = 'list-cast-vote-record-exports-on-usb-drive',
  ImportCastVoteRecordsInit = 'import-cast-vote-records-init',
  ImportCastVoteRecordsComplete = 'import-cast-vote-records-complete',
  ClearImportedCastVoteRecordsInit = 'clear-imported-cast-vote-records-init',
  ClearImportedCastVoteRecordsComplete = 'clear-imported-cast-vote-records-complete',
  RecomputingTally = 'recompute-tally-init',
  RecomputedTally = 'recompute-tally-complete',
  ManualTallyDataEdited = 'manual-tally-data-edited',
  ManualTallyDataRemoved = 'manual-tally-data-removed',
  MarkedTallyResultsOfficial = 'marked-tally-results-official',
  TallyReportPreviewed = 'tally-report-previewed',
  TallyReportPrinted = 'tally-report-printed',
  ConvertingResultsToSemsFormat = 'converting-to-sems',
  TestDeckPrinted = 'test-deck-printed',
  TestDeckTallyReportPrinted = 'test-deck-tally-report-printed',
  TestDeckTallyReportSavedToPdf = 'test-deck-tally-report-saved-to-pdf',
  InitialSetupPackageLoaded = 'initial-setup-zip-package-loaded',
  SystemSettingsSaveInitiated = 'system-settings-save-initiated',
  SystemSettingsSaved = 'system-settings-saved',
  SystemSettingsRetrieved = 'system-settings-retrieved',
  WriteInAdjudicated = 'write-in-adjudicated',

  // VxCentralScan specific user action logs
  TogglingTestMode = 'toggle-test-mode-init',
  ToggledTestMode = 'toggled-test-mode',
  ClearingBallotData = 'clear-ballot-data-init',
  ClearedBallotData = 'clear-ballot-data-complete',
  OverridingMarkThresholds = 'override-mark-threshold-init',
  OverrodeMarkThresholds = 'override-mark-thresholds-complete',
  SavedScanImageBackup = 'saved-scan-image-backup',
  ConfigureFromBallotPackageInit = 'configure-from-ballot-package-init',
  BallotPackageFilesReadFromUsb = 'ballot-package-files-read-from-usb',
  BallotConfiguredOnMachine = 'ballot-configure-machine-complete',
  ScannerConfigured = 'scanner-configure-complete',
  DeleteScanBatchInit = 'delete-cvr-batch-init',
  DeleteScanBatchComplete = 'delete-cvr-batch-complete',
  ScanBatchInit = 'scan-batch-init',
  ScanSheetComplete = 'scan-sheet-complete',
  ScanBatchComplete = 'scan-batch-complete',
  ScanBatchContinue = 'scan-batch-continue',
  ScanAdjudicationInfo = 'scan-adjudication-info',
  ScannerConfigReloaded = 'scanner-config-reloaded',
  SaveLogFileFound = 'save-log-file-found',
  ScanServiceConfigurationMessage = 'scan-service-config',
  AdminServiceConfigurationMessage = 'admin-service-config',
  FujitsuScanInit = 'fujitsu-scan-init',
  FujitsuScanImageScanned = 'fujitsu-scan-sheet-scanned',
  FujitsuScanBatchComplete = 'fujitsu-scan-batch-complete',
  FujitsuScanMessage = 'fujitsu-scan-message',
  LogConversionToCdfComplete = 'convert-log-cdf-complete',
  LogConversionToCdfLogLineError = 'convert-log-cdf-log-line-error',
  PrepareBootFromUsbInit = 'prepare-boot-from-usb-init',
  PrepareBootFromUsbComplete = 'prepare-boot-from-usb-complete',
  RebootMachine = 'reboot-machine',
  PowerDown = 'power-down-machine',
  BallotPackageLoadedFromUsb = 'ballot-package-load-from-usb-complete',

  // Scanners, central and precinct
  ExportCastVoteRecordsInit = 'export-cast-vote-records-init',
  ExportCastVoteRecordsComplete = 'export-cast-vote-records-complete',

  // Precinct Machine (VxMark, VxScan, VxMarkScan) State
  PollsOpened = 'polls-opened',
  VotingPaused = 'voting-paused',
  VotingResumed = 'voting-resumed',
  PollsClosed = 'polls-closed',
  ResetPollsToPaused = 'reset-polls-to-paused',
  BallotBagReplaced = 'ballot-bag-replaced',
  TallyReportClearedFromCard = 'tally-report-cleared-from-card',
  PrecinctConfigurationChanged = 'precinct-configuration-changed',
  ScannerBatchStarted = 'scanner-batch-started',
  ScannerBatchEnded = 'scanner-batch-ended',
  ScannerEvent = 'scanner-state-machine-event',
  ScannerStateChanged = 'scanner-state-machine-transition',
  PaperHandlerStateChanged = 'paper-handler-state-machine-transition',

  // VxMarkScan logs
  PatDeviceError = 'pat-device-error',
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

const AuthPinEntryEvent: LogDetails = {
  eventId: LogEventId.AuthPinEntry,
  eventType: LogEventType.UserAction,
  documentationMessage: 'A user entered a PIN to log in.',
};

const AuthLoginEvent: LogDetails = {
  eventId: LogEventId.AuthLogin,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A user logged in (or failed to log in). An optional reason key may be provided for failures.',
};

const AuthLogoutEvent: LogDetails = {
  eventId: LogEventId.AuthLogout,
  eventType: LogEventType.UserAction,
  documentationMessage: 'A user logged out (or failed to log out).',
};

const UsbDriveDetected: LogDetails = {
  eventId: LogEventId.UsbDriveDetected,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'A USB drive was detected.',
  defaultMessage: 'USB drive detected.',
};

const UsbDriveRemoved: LogDetails = {
  eventId: LogEventId.UsbDriveRemoved,
  eventType: LogEventType.UserAction,
  documentationMessage: 'A USB drive was removed by the user.',
  defaultMessage: 'USB drive removed.',
};

const UsbDriveEjectInit: LogDetails = {
  eventId: LogEventId.UsbDriveEjectInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A request to eject the current USB drive was made by the user, the USB drive will now be ejected.',
  defaultMessage: 'Attempting to eject USB drive based on user request...',
};

const UsbDriveEjected: LogDetails = {
  eventId: LogEventId.UsbDriveEjected,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Attempt to eject USB drive complete. Success or failure indicated by disposition.',
};

const UsbDriveFormatInit: LogDetails = {
  eventId: LogEventId.UsbDriveFormatInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A request to format the current USB drive was made by the user. The usb drive will now be reformatted for compatibility with VotingWorks software.',
  defaultMessage: 'Attempting to reformat USB drive based on user request...',
};

const UsbDriveFormatted: LogDetails = {
  eventId: LogEventId.UsbDriveFormatted,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Attempt to reformat USB drive complete. Success or failure indicated by disposition.',
};

const UsbDriveMountInit: LogDetails = {
  eventId: LogEventId.UsbDriveMountInit,
  eventType: LogEventType.ApplicationAction,
  documentationMessage:
    'The USB drive is attempting to mount. This action is taken automatically by the application when a new USB drive is detected.',
  defaultMessage: 'Application is attempting to mount a USB drive...',
};

const UsbDriveMounted: LogDetails = {
  eventId: LogEventId.UsbDriveMounted,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Attempt to mount USB drive mount complete. Success or failure indicated by disposition.',
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
    'A piece of information (current election, loaded CVR files, etc.) is loaded from storage. May happen as an automated action when an application starts up, or as a result of a user action.',
};
const SaveToStorage: LogDetails = {
  eventId: LogEventId.SaveToStorage,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A piece of information is saved to storage, usually resulting from a user action for example a user loading CVR files results in those files being saved to storage.',
};

const SaveBallotPackageInit: LogDetails = {
  eventId: LogEventId.SaveBallotPackageInit,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Saving the ballot package is initiated.',
  defaultMessage: 'User initiated saving the ballot package...',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};
const SaveBallotPackageComplete: LogDetails = {
  eventId: LogEventId.SaveBallotPackageComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Saving the ballot package completed, success or failure is indicated by the disposition.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};

const FileSaved: LogDetails = {
  eventId: LogEventId.FileSaved,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'File is saved to a USB drive. Success or failure indicated by disposition. Type of file specified with "fileType" key. For success logs the saved filename specified with "filename" key.',
};

const SmartCardProgramInit: LogDetails = {
  eventId: LogEventId.SmartCardProgramInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A smart card is being programmed. The new smart card user role is indicated by the programmedUserRole key.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const SmartCardProgramComplete: LogDetails = {
  eventId: LogEventId.SmartCardProgramComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A smart card has been programmed (or failed to be programmed). The new smart card user role is indicated by the programmedUserRole key.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};

const SmartCardUnprogramInit: LogDetails = {
  eventId: LogEventId.SmartCardUnprogramInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A smart card is being unprogrammed. The current smart card user role is indicated by the programmedUserRole key.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const SmartCardUnprogramComplete: LogDetails = {
  eventId: LogEventId.SmartCardUnprogramComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A smart card has been unprogrammed (or failed to be unprogrammed). The previous (or current in the case of failure) smart card user role is indicated by the previousProgrammedUserRole key (or programmedUserRole key in the case of failure).',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};

const ListCastVoteRecordExportsOnUsbDrive: LogDetails = {
  eventId: LogEventId.ListCastVoteRecordExportsOnUsbDrive,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Cast vote record exports on the inserted USB drive were listed.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};

const ImportCastVoteRecordsInit: LogDetails = {
  eventId: LogEventId.ImportCastVoteRecordsInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Cast vote records are being imported from a USB drive.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const ImportCastVoteRecordsComplete: LogDetails = {
  eventId: LogEventId.ImportCastVoteRecordsComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Cast vote records have been imported from a USB drive (or failed to be imported).',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};

const ClearImportedCastVoteRecordsInit: LogDetails = {
  eventId: LogEventId.ClearImportedCastVoteRecordsInit,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Imported cast vote records are being cleared.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const ClearImportedCastVoteRecordsComplete: LogDetails = {
  eventId: LogEventId.ClearImportedCastVoteRecordsComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Imported cast vote records have been cleared (or failed to be cleared).',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
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
const ManualTallyDataEdited: LogDetails = {
  eventId: LogEventId.ManualTallyDataEdited,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User added or edited manually entered tally data to be included in the results alongside loaded CVR files.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const ManualTallyDataRemoved: LogDetails = {
  eventId: LogEventId.ManualTallyDataRemoved,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User removed manual tally data that was previously entered.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const MarkedTallyResultsOfficial: LogDetails = {
  eventId: LogEventId.MarkedTallyResultsOfficial,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User marked the tally results as official. This disables loading more CVR files or editing manual tally data.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
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

const TestDeckTallyReportSavedToPdf: LogDetails = {
  eventId: LogEventId.TestDeckTallyReportSavedToPdf,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User attempted to save the test deck tally report as PDF. Success or failure indicated by subsequent FileSaved log disposition.',
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
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const ClearedBallotData: LogDetails = {
  eventId: LogEventId.ClearedBallotData,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished clearing ballot data in the given application. Success or failure is indicated by the disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const OverridingMarkThresholds: LogDetails = {
  eventId: LogEventId.OverridingMarkThresholds,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated overriding the thresholds of when to count marks seen by the scanning module. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.',
  defaultMessage: 'User is overriding mark thresholds...',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const OverrodeMarkThresholds: LogDetails = {
  eventId: LogEventId.OverrodeMarkThresholds,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has finished overriding the thresholds of when to count marks seen by the scanning module. Success or failure is indicated by the disposition. New mark thresholds specified in the keys `marginal` `definite` and, if defined, `writeInText`.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};
const SavedScanImageBackup: LogDetails = {
  eventId: LogEventId.SavedScanImageBackup,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User saved a backup file of the scanned ballot image files and CVRs. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const ConfigureFromBallotPackageInit: LogDetails = {
  eventId: LogEventId.ConfigureFromBallotPackageInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User had initiated configuring the machine from a ballot package. The ballot package will be loaded from the USB drive, each ballot will be configured, the scanner will be configured, and then the election configuration will be complete.',
  defaultMessage: 'Loading ballot package from USB and configuring machine...',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};
const BallotPackageLoadedFromUsb: LogDetails = {
  eventId: LogEventId.BallotPackageLoadedFromUsb,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The ballot package has been read from the USB drive. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};
const BallotConfiguredOnMachine: LogDetails = {
  eventId: LogEventId.BallotConfiguredOnMachine,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The specified ballot has been configured on the machine. Success or failure indicated by disposition. `ballotStyleId`, `precinctId` and `isLiveMode` keys specify details on the ballot configured.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};
const ScannerConfigured: LogDetails = {
  eventId: LogEventId.ScannerConfigured,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The final configuration steps for the scanner for the ballot package have completed. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};
const BallotPackageFilesReadFromUsb: LogDetails = {
  eventId: LogEventId.BallotPackageFilesReadFromUsb,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'List of ballot packages read from usb and displayed to user to load to machine.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const ExportCastVoteRecordsInit: LogDetails = {
  eventId: LogEventId.ExportCastVoteRecordsInit,
  eventType: LogEventType.UserAction,
  documentationMessage: 'Cast vote records are being exported to a USB drive.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanService,
    LogSource.VxScanBackend,
  ],
};
const ExportCastVoteRecordsComplete: LogDetails = {
  eventId: LogEventId.ExportCastVoteRecordsComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Cast vote records have been exported to a USB drive (or failed to be exported).',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanService,
    LogSource.VxScanBackend,
  ],
};

const DeleteScanBatchInit: LogDetails = {
  eventId: LogEventId.DeleteScanBatchInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has initiated deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const DeleteScanBatchComplete: LogDetails = {
  eventId: LogEventId.DeleteScanBatchComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'User has completed deleting a scanning batch. Number of ballots in batch specified by keep `numberOfBallotsInBatch`. Batch ID specified by `batchId`.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const ScanBatchInit: LogDetails = {
  eventId: LogEventId.ScanBatchInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The user has begun scanning a new batch of ballots. Success or failure of beginning the process of scanning indicated by disposition. Batch ID for next scanned batch indicated in batchId.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const ScanSheetComplete: LogDetails = {
  eventId: LogEventId.ScanSheetComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A single sheet in a batch has completed scanning. Success or failure of the scanning indicated by disposition. Ballots rejected due to being unreadable, configured for the wrong election, needed resolution, etc. marked as `failure`. Current batch specified by `batchId` and sheet in batch specified by `sheetCount`.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const ScanBatchComplete: LogDetails = {
  eventId: LogEventId.ScanBatchComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'A batch of scanned sheets has finished scanning. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const ScanBatchContinue: LogDetails = {
  eventId: LogEventId.ScanBatchContinue,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Scanning continued by user after errors and/or warning stopped scanning. Log will indicate if the sheet was tabulated with warnings, or if the user indicated removing the ballot in order to continue scanning.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const ScanAdjudicationInfo: LogDetails = {
  eventId: LogEventId.ScanAdjudicationInfo,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Information about a ballot sheet that needs adjudication from the user. The possible unresolvable errors are InvalidTestModePage when a test mode ballot is seen when scanning in live mode or vice versa, InvalidElectionHashPage when a sheet for the wrong election is seen, InvalidPrecinctPage when a sheet for an invalid precinct is seen, UnreadablePage for a sheet that is unrecognizable as either a HMPB or BMD ballot, and BlankPage for a blank sheet. Warnings that the user can choose to tabulate with a ballot include MarginalMark, Overvote, Undervote, and BlankBallot (a ballot where there are no votes for any contest).',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const ScannerConfigReloaded: LogDetails = {
  eventId: LogEventId.ScannerConfigReloaded,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Configuration information for the machine including the election, if the machine is in test mode, and mark threshold override values were reloaded from the backend service storing this information.',
  restrictInDocumentationToApps: [
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const SaveLogFileFound: LogDetails = {
  eventId: LogEventId.SaveLogFileFound,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'When the user is saving logs, indicates the success/failure of finding the expected log file on the machine.',
};
const LogConversionToCdfComplete: LogDetails = {
  eventId: LogEventId.LogConversionToCdfComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'The user has converted the log file to a CDF format for saving. Success or failure indicated by disposition.',
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
    LogSource.VxCentralScanFrontend,
    LogSource.VxScanFrontend,
  ],
};

const AdminServiceConfigurationMessage: LogDetails = {
  eventId: LogEventId.AdminServiceConfigurationMessage,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Message from the admin service about how it is configured while starting up.',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};

const FujitsuScanInit: LogDetails = {
  eventId: LogEventId.FujitsuScanInit,
  eventType: LogEventType.ApplicationAction,
  documentationMessage:
    'Application is initiating a new scanning batch on the fujitsu scanner.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const FujitsuScanImageScanned: LogDetails = {
  eventId: LogEventId.FujitsuScanImageScanned,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'A scanned image has returned while scanning from a fujitsu scanner, or an error was seen while scanning. Success or failure indicated by disposition.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const FujitsuScanBatchComplete: LogDetails = {
  eventId: LogEventId.FujitsuScanBatchComplete,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'A batch of sheets has completed scanning on the fujitsu scanner.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};
const FujitsuScanMessage: LogDetails = {
  eventId: LogEventId.FujitsuScanMessage,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Message from the driver handling the fujitsu scanner regarding scanning progress.',
  restrictInDocumentationToApps: [LogSource.VxCentralScanFrontend],
};

const PrepareBootFromUsbInit: LogDetails = {
  eventId: LogEventId.PrepareBootFromUsbInit,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Message that a user triggered an attempt to reboot the machine and boot from an inserted USB drive.',
};
const PrepareBootFromUsbComplete: LogDetails = {
  eventId: LogEventId.PrepareBootFromUsbComplete,
  eventType: LogEventType.UserAction,
  documentationMessage:
    'Message that the machine has completed preparing to boot from USB. Success or failure indicated by the disposition.',
};
const RebootMachine: LogDetails = {
  eventId: LogEventId.RebootMachine,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has triggered a reboot of the machine.',
};
const PowerDown: LogDetails = {
  eventId: LogEventId.PowerDown,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has triggered the machine to power down.',
};

const PollsOpened: LogDetails = {
  eventId: LogEventId.PollsOpened,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has opened the polls.',
  restrictInDocumentationToApps: [
    LogSource.VxMarkFrontend,
    LogSource.VxScanFrontend,
  ],
};

const VotingPaused: LogDetails = {
  eventId: LogEventId.VotingPaused,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has paused voting and polls are now paused.',
  restrictInDocumentationToApps: [
    LogSource.VxMarkFrontend,
    LogSource.VxScanFrontend,
  ],
};

const VotingResumed: LogDetails = {
  eventId: LogEventId.VotingResumed,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has resumed voting and polls are now open.',
  restrictInDocumentationToApps: [
    LogSource.VxMarkFrontend,
    LogSource.VxScanFrontend,
  ],
};

const PollsClosed: LogDetails = {
  eventId: LogEventId.PollsClosed,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has closed the polls.',
  restrictInDocumentationToApps: [
    LogSource.VxMarkFrontend,
    LogSource.VxScanFrontend,
  ],
};

const ResetPollsToPaused: LogDetails = {
  eventId: LogEventId.ResetPollsToPaused,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has reset the polls from closed to paused.',
  restrictInDocumentationToApps: [
    LogSource.VxMarkFrontend,
    LogSource.VxScanFrontend,
  ],
};

const BallotBagReplaced: LogDetails = {
  eventId: LogEventId.BallotBagReplaced,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User confirmed that they replaced the ballot bag.',
  restrictInDocumentationToApps: [LogSource.VxScanFrontend],
};

const TallyReportClearedFromCard: LogDetails = {
  eventId: LogEventId.TallyReportClearedFromCard,
  eventType: LogEventType.ApplicationAction,
  documentationMessage:
    'The tally report has been cleared from the poll worker card.',
  restrictInDocumentationToApps: [LogSource.VxMarkFrontend],
};

const PrecinctConfigurationChanged: LogDetails = {
  eventId: LogEventId.PrecinctConfigurationChanged,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User has changed the precinct setting.',
  restrictInDocumentationToApps: [
    LogSource.VxMarkFrontend,
    LogSource.VxScanFrontend,
  ],
};

const ScannerBatchStarted: LogDetails = {
  eventId: LogEventId.ScannerBatchStarted,
  eventType: LogEventType.SystemAction,
  documentationMessage:
    'The precinct scanner has started a new batch, either because the polls were opened or the ballot bag was replaced.',
  restrictInDocumentationToApps: [LogSource.VxScanBackend],
};

const ScannerBatchEnded: LogDetails = {
  eventId: LogEventId.ScannerBatchEnded,
  eventType: LogEventType.SystemAction,
  documentationMessage:
    'The precinct scanner has ended the current batch, either because the polls were closed (or paused) or the ballot bag was replaced.',
  restrictInDocumentationToApps: [LogSource.VxScanBackend],
};

const ScannerEvent: LogDetails = {
  eventId: LogEventId.ScannerEvent,
  eventType: LogEventType.ApplicationAction,
  documentationMessage: 'Precinct scanner state machine received an event.',
  restrictInDocumentationToApps: [LogSource.VxScanBackend],
};

const ScannerStateChanged: LogDetails = {
  eventId: LogEventId.ScannerStateChanged,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'Precinct scanner state machine transitioned states.',
  restrictInDocumentationToApps: [LogSource.VxScanBackend],
};

const PaperHandlerStateChanged: LogDetails = {
  eventId: LogEventId.PaperHandlerStateChanged,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage:
    'Precinct print/scan BMD state machine transitioned states.',
  restrictInDocumentationToApps: [LogSource.VxMarkScanBackend],
};

const InitialSetupPackageLoaded: LogDetails = {
  eventId: LogEventId.InitialSetupPackageLoaded,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User loaded VxAdmin initial setup package',
  restrictInDocumentationToApps: [LogSource.VxAdminFrontend],
};

const SystemSettingsSaveInitiated: LogDetails = {
  eventId: LogEventId.SystemSettingsSaveInitiated,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'VxAdmin attempting to save System Settings to db',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};

const SystemSettingsSaved: LogDetails = {
  eventId: LogEventId.SystemSettingsSaved,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'VxAdmin System Settings saved to db',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};

const SystemSettingsRetrieved: LogDetails = {
  eventId: LogEventId.SystemSettingsRetrieved,
  eventType: LogEventType.ApplicationStatus,
  documentationMessage: 'VxAdmin System Settings read from db',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
};
const PatDeviceError: LogDetails = {
  eventId: LogEventId.PatDeviceError,
  eventType: LogEventType.SystemStatus,
  documentationMessage:
    'VxMarkScan encountered an error with the built-in PAT device port or the device itself',
  restrictInDocumentationToApps: [LogSource.VxMarkScanBackend],
};

const WriteInAdjudicated: LogDetails = {
  eventId: LogEventId.WriteInAdjudicated,
  eventType: LogEventType.UserAction,
  documentationMessage: 'User adjudicated a write-in.',
  restrictInDocumentationToApps: [LogSource.VxAdminService],
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
    case LogEventId.AuthPinEntry:
      return AuthPinEntryEvent;
    case LogEventId.AuthLogin:
      return AuthLoginEvent;
    case LogEventId.AuthLogout:
      return AuthLogoutEvent;
    case LogEventId.UsbDriveEjectInit:
      return UsbDriveEjectInit;
    case LogEventId.UsbDriveEjected:
      return UsbDriveEjected;
    case LogEventId.UsbDriveFormatInit:
      return UsbDriveFormatInit;
    case LogEventId.UsbDriveFormatted:
      return UsbDriveFormatted;
    case LogEventId.UsbDriveDetected:
      return UsbDriveDetected;
    case LogEventId.UsbDriveRemoved:
      return UsbDriveRemoved;
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
    case LogEventId.SaveBallotPackageInit:
      return SaveBallotPackageInit;
    case LogEventId.SaveBallotPackageComplete:
      return SaveBallotPackageComplete;
    case LogEventId.FileSaved:
      return FileSaved;
    case LogEventId.SmartCardProgramInit:
      return SmartCardProgramInit;
    case LogEventId.SmartCardProgramComplete:
      return SmartCardProgramComplete;
    case LogEventId.SmartCardUnprogramInit:
      return SmartCardUnprogramInit;
    case LogEventId.SmartCardUnprogramComplete:
      return SmartCardUnprogramComplete;
    case LogEventId.ListCastVoteRecordExportsOnUsbDrive:
      return ListCastVoteRecordExportsOnUsbDrive;
    case LogEventId.ImportCastVoteRecordsInit:
      return ImportCastVoteRecordsInit;
    case LogEventId.ImportCastVoteRecordsComplete:
      return ImportCastVoteRecordsComplete;
    case LogEventId.ClearImportedCastVoteRecordsInit:
      return ClearImportedCastVoteRecordsInit;
    case LogEventId.ClearImportedCastVoteRecordsComplete:
      return ClearImportedCastVoteRecordsComplete;
    case LogEventId.RecomputingTally:
      return RecomputingTally;
    case LogEventId.RecomputedTally:
      return RecomputedTally;
    case LogEventId.ManualTallyDataEdited:
      return ManualTallyDataEdited;
    case LogEventId.ManualTallyDataRemoved:
      return ManualTallyDataRemoved;
    case LogEventId.MarkedTallyResultsOfficial:
      return MarkedTallyResultsOfficial;
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
    case LogEventId.TestDeckTallyReportSavedToPdf:
      return TestDeckTallyReportSavedToPdf;
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
    case LogEventId.SavedScanImageBackup:
      return SavedScanImageBackup;
    case LogEventId.ConfigureFromBallotPackageInit:
      return ConfigureFromBallotPackageInit;
    case LogEventId.BallotPackageLoadedFromUsb:
      return BallotPackageLoadedFromUsb;
    case LogEventId.BallotConfiguredOnMachine:
      return BallotConfiguredOnMachine;
    case LogEventId.ScannerConfigured:
      return ScannerConfigured;
    case LogEventId.BallotPackageFilesReadFromUsb:
      return BallotPackageFilesReadFromUsb;
    case LogEventId.ExportCastVoteRecordsInit:
      return ExportCastVoteRecordsInit;
    case LogEventId.ExportCastVoteRecordsComplete:
      return ExportCastVoteRecordsComplete;
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
    case LogEventId.SaveLogFileFound:
      return SaveLogFileFound;
    case LogEventId.ScanServiceConfigurationMessage:
      return ScanServiceConfigurationMessage;
    case LogEventId.AdminServiceConfigurationMessage:
      return AdminServiceConfigurationMessage;
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
    case LogEventId.PrepareBootFromUsbInit:
      return PrepareBootFromUsbInit;
    case LogEventId.PrepareBootFromUsbComplete:
      return PrepareBootFromUsbComplete;
    case LogEventId.RebootMachine:
      return RebootMachine;
    case LogEventId.PowerDown:
      return PowerDown;
    case LogEventId.PollsOpened:
      return PollsOpened;
    case LogEventId.VotingPaused:
      return VotingPaused;
    case LogEventId.VotingResumed:
      return VotingResumed;
    case LogEventId.PollsClosed:
      return PollsClosed;
    case LogEventId.ResetPollsToPaused:
      return ResetPollsToPaused;
    case LogEventId.BallotBagReplaced:
      return BallotBagReplaced;
    case LogEventId.TallyReportClearedFromCard:
      return TallyReportClearedFromCard;
    case LogEventId.PrecinctConfigurationChanged:
      return PrecinctConfigurationChanged;
    case LogEventId.ScannerBatchEnded:
      return ScannerBatchEnded;
    case LogEventId.ScannerBatchStarted:
      return ScannerBatchStarted;
    case LogEventId.ScannerEvent:
      return ScannerEvent;
    case LogEventId.ScannerStateChanged:
      return ScannerStateChanged;
    case LogEventId.PaperHandlerStateChanged:
      return PaperHandlerStateChanged;
    case LogEventId.InitialSetupPackageLoaded:
      return InitialSetupPackageLoaded;
    case LogEventId.SystemSettingsSaveInitiated:
      return SystemSettingsSaveInitiated;
    case LogEventId.SystemSettingsSaved:
      return SystemSettingsSaved;
    case LogEventId.SystemSettingsRetrieved:
      return SystemSettingsRetrieved;
    case LogEventId.WriteInAdjudicated:
      return WriteInAdjudicated;
    case LogEventId.PatDeviceError:
      return PatDeviceError;

    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(eventId);
  }
}
