#![deny(clippy::all)]

use std::{
  cell::Cell,
  collections::HashMap,
  fmt::Display,
  io::{BufRead, BufReader, BufWriter, Lines},
};

use napi::{Error, Result, Status};
use serde::{ser::Serializer, Deserialize, Serialize};

#[macro_use]
extern crate napi_derive;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
  source: LogSource,
  event_id: LogEventId,
  event_type: LogEventType,
  user: LoggingUserRole,
  disposition: LogDisposition,
  message: Option<String>,
  time_log_initiated: Option<String>,

  #[serde(flatten)]
  extras: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
pub enum LogSource {
  #[serde(rename = "system")]
  System,
  #[serde(rename = "vx-admin-frontend")]
  VxAdminFrontend,
  #[serde(rename = "vx-admin-frontend-server")]
  VxAdminFrontendServer,
  #[serde(rename = "vx-admin-service")]
  VxAdminService,
  #[serde(rename = "vx-central-scan-frontend")]
  VxCentralScanFrontend,
  #[serde(rename = "vx-central-scan-frontend-server")]
  VxCentralScanFrontendServer,
  #[serde(rename = "vx-central-scan-service")]
  VxCentralScanService,
  #[serde(rename = "vx-design-service")]
  VxDesignService,
  #[serde(rename = "vx-design-worker")]
  VxDesignWorker,
  #[serde(rename = "vx-scan-frontend")]
  VxScanFrontend,
  #[serde(rename = "vx-scan-frontend-server")]
  VxScanFrontendServer,
  #[serde(rename = "vx-scan-backend")]
  VxScanBackend,
  #[serde(rename = "vx-mark-frontend")]
  VxMarkFrontend,
  #[serde(rename = "vx-mark-frontend-server")]
  VxMarkFrontendServer,
  #[serde(rename = "vx-mark-backend")]
  VxMarkBackend,
  #[serde(rename = "vx-mark-scan-frontend")]
  VxMarkScanFrontend,
  #[serde(rename = "vx-mark-scan-frontend-server")]
  VxMarkScanFrontendServer,
  #[serde(rename = "vx-mark-scan-backend")]
  VxMarkScanBackend,
  #[serde(rename = "vx-mark-scan-pat-daemon")]
  VxMarkScanPatDaemon,
  #[serde(rename = "vx-mark-scan-controller-daemon")]
  VxMarkScanControllerDaemon,
  #[serde(rename = "vx-ballot-activation-frontend")]
  VxBallotActivationFrontend,
  #[serde(rename = "vx-ballot-activation-service")]
  VxBallotActivationService,
  #[serde(rename = "vx-scan-service")]
  VxScanService,
  #[serde(rename = "vx-development-script")]
  VxDevelopmentScript,
  #[serde(rename = "vx-pollbook-frontend")]
  VxPollbookFrontend,
  #[serde(rename = "vx-pollbook-backend")]
  VxPollbookBackend,
}

impl Display for LogSource {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.serialize(f)
  }
}

#[derive(Serialize, Deserialize)]
pub enum LogEventId {
  #[serde(rename = "election-configured")]
  ElectionConfigured,
  #[serde(rename = "election-unconfigured")]
  ElectionUnconfigured,
  #[serde(rename = "auth-pin-entry")]
  AuthPinEntry,
  #[serde(rename = "auth-pin-entry-lockout")]
  AuthPinEntryLockout,
  #[serde(rename = "auth-login")]
  AuthLogin,
  #[serde(rename = "auth-voter-session-updated")]
  AuthVoterSessionUpdated,
  #[serde(rename = "auth-logout")]
  AuthLogout,
  #[serde(rename = "usb-drive-eject-init")]
  UsbDriveEjectInit,
  #[serde(rename = "usb-drive-eject-complete")]
  UsbDriveEjected,
  #[serde(rename = "usb-drive-mount-init")]
  UsbDriveMountInit,
  #[serde(rename = "usb-drive-mount-complete")]
  UsbDriveMounted,
  #[serde(rename = "usb-drive-format-init")]
  UsbDriveFormatInit,
  #[serde(rename = "usb-drive-format-complete")]
  UsbDriveFormatted,
  #[serde(rename = "application-startup")]
  ApplicationStartup,
  #[serde(rename = "printer-config-added")]
  PrinterConfigurationAdded,
  #[serde(rename = "printer-config-removed")]
  PrinterConfigurationRemoved,
  #[serde(rename = "printer-status-changed")]
  PrinterStatusChanged,
  #[serde(rename = "printer-print-request")]
  PrinterPrintRequest,
  #[serde(rename = "printer-print-complete")]
  PrinterPrintComplete,
  #[serde(rename = "device-attached")]
  DeviceAttached,
  #[serde(rename = "device-unattached")]
  DeviceUnattached,
  #[serde(rename = "workspace-config")]
  WorkspaceConfigurationMessage,
  #[serde(rename = "toggle-test-mode-init")]
  TogglingTestMode,
  #[serde(rename = "toggled-test-mode")]
  ToggledTestMode,
  #[serde(rename = "file-saved")]
  FileSaved,
  #[serde(rename = "convert-log-cdf-complete")]
  LogConversionToCdfComplete,
  #[serde(rename = "convert-log-cdf-log-line-error")]
  LogConversionToCdfLogLineError,
  #[serde(rename = "reboot-machine")]
  RebootMachine,
  #[serde(rename = "power-down-machine")]
  PowerDown,
  #[serde(rename = "diagnostic-init")]
  DiagnosticInit,
  #[serde(rename = "diagnostic-error")]
  DiagnosticError,
  #[serde(rename = "diagnostic-complete")]
  DiagnosticComplete,
  #[serde(rename = "readiness-report-printed")]
  ReadinessReportPrinted,
  #[serde(rename = "readiness-report-saved")]
  ReadinessReportSaved,
  #[serde(rename = "headphones-detection-errors")]
  HeadphonesDetectionError,
  #[serde(rename = "unknown-error")]
  UnknownError,
  #[serde(rename = "permission-denied")]
  PermissionDenied,
  #[serde(rename = "parse-error")]
  ParseError,
  #[serde(rename = "database-connect-init")]
  DatabaseConnectInit,
  #[serde(rename = "database-connect-complete")]
  DatabaseConnectComplete,
  #[serde(rename = "database-create-init")]
  DatabaseCreateInit,
  #[serde(rename = "database-create-complete")]
  DatabaseCreateComplete,
  #[serde(rename = "database-destroy-init")]
  DatabaseDestroyInit,
  #[serde(rename = "database-destroy-complete")]
  DatabaseDestroyComplete,
  #[serde(rename = "file-read-error")]
  FileReadError,
  #[serde(rename = "dmverity-boot")]
  DmVerityBoot,
  #[serde(rename = "machine-boot-init")]
  MachineBootInit,
  #[serde(rename = "machine-boot-complete")]
  MachineBootComplete,
  #[serde(rename = "machine-shutdown-init")]
  MachineShutdownInit,
  #[serde(rename = "machine-shutdown-complete")]
  MachineShutdownComplete,
  #[serde(rename = "usb-device-change-detected")]
  UsbDeviceChangeDetected,
  #[serde(rename = "info")]
  Info,
  #[serde(rename = "heartbeat")]
  Heartbeat,
  #[serde(rename = "process-started")]
  ProcessStarted,
  #[serde(rename = "process-terminated")]
  ProcessTerminated,
  #[serde(rename = "sudo-action")]
  SudoAction,
  #[serde(rename = "password-change")]
  PasswdChange,
  #[serde(rename = "save-election-package-init")]
  SaveElectionPackageInit,
  #[serde(rename = "save-election-package-complete")]
  SaveElectionPackageComplete,
  #[serde(rename = "smart-card-program-init")]
  SmartCardProgramInit,
  #[serde(rename = "smart-card-program-complete")]
  SmartCardProgramComplete,
  #[serde(rename = "smart-card-unprogram-init")]
  SmartCardUnprogramInit,
  #[serde(rename = "smart-card-unprogram-complete")]
  SmartCardUnprogramComplete,
  #[serde(rename = "list-cast-vote-record-exports-on-usb-drive")]
  ListCastVoteRecordExportsOnUsbDrive,
  #[serde(rename = "import-cast-vote-records-init")]
  ImportCastVoteRecordsInit,
  #[serde(rename = "import-cast-vote-records-complete")]
  ImportCastVoteRecordsComplete,
  #[serde(rename = "clear-imported-cast-vote-records-init")]
  ClearImportedCastVoteRecordsInit,
  #[serde(rename = "clear-imported-cast-vote-records-complete")]
  ClearImportedCastVoteRecordsComplete,
  #[serde(rename = "manual-tally-data-edited")]
  ManualTallyDataEdited,
  #[serde(rename = "manual-tally-data-removed")]
  ManualTallyDataRemoved,
  #[serde(rename = "election-results-reporting-tally-file-imported")]
  ElectionResultsReportingTallyFileImported,
  #[serde(rename = "marked-tally-results-official")]
  MarkedTallyResultsOfficial,
  #[serde(rename = "election-report-previewed")]
  ElectionReportPreviewed,
  #[serde(rename = "election-report-printed")]
  ElectionReportPrinted,
  #[serde(rename = "write-in-adjudicated")]
  WriteInAdjudicated,
  #[serde(rename = "clear-ballot-data-init")]
  ClearingBallotData,
  #[serde(rename = "clear-ballot-data-complete")]
  ClearedBallotData,
  #[serde(rename = "delete-cvr-batch-init")]
  DeleteScanBatchInit,
  #[serde(rename = "delete-cvr-batch-complete")]
  DeleteScanBatchComplete,
  #[serde(rename = "scan-batch-init")]
  ScanBatchInit,
  #[serde(rename = "scan-sheet-complete")]
  ScanSheetComplete,
  #[serde(rename = "scan-batch-complete")]
  ScanBatchComplete,
  #[serde(rename = "scan-batch-continue")]
  ScanBatchContinue,
  #[serde(rename = "scan-adjudication-info")]
  ScanAdjudicationInfo,
  #[serde(rename = "fujitsu-scan-init")]
  FujitsuScanInit,
  #[serde(rename = "fujitsu-scan-sheet-scanned")]
  FujitsuScanImageScanned,
  #[serde(rename = "fujitsu-scan-batch-complete")]
  FujitsuScanBatchComplete,
  #[serde(rename = "fujitsu-scan-message")]
  FujitsuScanMessage,
  #[serde(rename = "election-package-load-from-usb-complete")]
  ElectionPackageLoadedFromUsb,
  #[serde(rename = "export-cast-vote-records-init")]
  ExportCastVoteRecordsInit,
  #[serde(rename = "export-cast-vote-records-complete")]
  ExportCastVoteRecordsComplete,
  #[serde(rename = "polls-opened")]
  PollsOpened,
  #[serde(rename = "voting-paused")]
  VotingPaused,
  #[serde(rename = "voting-resumed")]
  VotingResumed,
  #[serde(rename = "polls-closed")]
  PollsClosed,
  #[serde(rename = "reset-polls-to-paused")]
  ResetPollsToPaused,
  #[serde(rename = "ballot-box-emptied")]
  BallotBoxEmptied,
  #[serde(rename = "precinct-configuration-changed")]
  PrecinctConfigurationChanged,
  #[serde(rename = "scanner-batch-started")]
  ScannerBatchStarted,
  #[serde(rename = "scanner-batch-ended")]
  ScannerBatchEnded,
  #[serde(rename = "scanner-state-machine-event")]
  ScannerEvent,
  #[serde(rename = "scanner-state-machine-transition")]
  ScannerStateChanged,
  #[serde(rename = "sound-toggled")]
  SoundToggled,
  #[serde(rename = "double-sheet-toggled")]
  DoubleSheetDetectionToggled,
  #[serde(rename = "continuous-export-toggled")]
  ContinuousExportToggled,
  #[serde(rename = "mark-scan-state-machine-event")]
  MarkScanStateMachineEvent,
  #[serde(rename = "pat-device-error")]
  PatDeviceError,
  #[serde(rename = "paper-handler-state-machine-transition")]
  PaperHandlerStateChanged,
  #[serde(rename = "vote-cast")]
  VoteCast,
  #[serde(rename = "ballot-invalidated")]
  BallotInvalidated,
  #[serde(rename = "poll-worker-confirmed-ballot-removal")]
  PollWorkerConfirmedBallotRemoval,
  #[serde(rename = "blank-sheet-interpretation")]
  BlankInterpretation,
  #[serde(rename = "paper-handler-connection")]
  PaperHandlerConnection,
  #[serde(rename = "create-virtual-uinput-device-init")]
  CreateVirtualUinputDeviceInit,
  #[serde(rename = "create-virtual-uinput-device-complete")]
  CreateVirtualUinputDeviceComplete,
  #[serde(rename = "connect-to-gpio-pin-init")]
  ConnectToGpioPinInit,
  #[serde(rename = "connect-to-gpio-pin-complete")]
  ConnectToGpioPinComplete,
  #[serde(rename = "connect-to-pat-input-init")]
  ConnectToPatInputInit,
  #[serde(rename = "connect-to-pat-input-complete")]
  ConnectToPatInputComplete,
  #[serde(rename = "controller-connection-init")]
  ControllerConnectionInit,
  #[serde(rename = "controller-connection-complete")]
  ControllerConnectionComplete,
  #[serde(rename = "controller-handshake-init")]
  ControllerHandshakeInit,
  #[serde(rename = "controller-handshake-complete")]
  ControllerHandshakeComplete,
  #[serde(rename = "error-setting-sigint-handler")]
  ErrorSettingSigintHandler,
  #[serde(rename = "unexpected-hardware-device-response")]
  UnexpectedHardwareDeviceResponse,
  #[serde(rename = "no-pid")]
  NoPid,
  #[serde(rename = "signed-hash-validation-init")]
  SignedHashValidationInit,
  #[serde(rename = "signed-hash-validation-complete")]
  SignedHashValidationComplete,
  #[serde(rename = "background-task-started")]
  BackgroundTaskStarted,
  #[serde(rename = "background-task-completed")]
  BackgroundTaskCompleted,
  #[serde(rename = "background-task-failure")]
  BackgroundTaskFailure,
  #[serde(rename = "background-task-success")]
  BackgroundTaskSuccess,
  #[serde(rename = "background-task-cancelled")]
  BackgroundTaskCancelled,
  #[serde(rename = "background-task-status")]
  BackgroundTaskStatus,
  #[serde(rename = "api-call")]
  ApiCall,
}

impl Display for LogEventId {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.serialize(f)
  }
}

#[derive(Serialize, Deserialize)]
pub enum LogEventType {
  #[serde(rename = "user-action")]
  UserAction,
  #[serde(rename = "application-status")]
  ApplicationStatus,
  #[serde(rename = "system-action")]
  SystemAction,
  #[serde(rename = "system-status")]
  SystemStatus,
  #[serde(rename = "application-action")]
  ApplicationAction,
}

impl Display for LogEventType {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.serialize(f)
  }
}

#[derive(Serialize, Deserialize)]
pub enum LoggingUserRole {
  #[serde(rename = "vendor")]
  Vendor,
  #[serde(rename = "system_administrator")]
  SystemAdministrator,
  #[serde(rename = "election_manager")]
  ElectionManager,
  #[serde(rename = "poll_worker")]
  PollWorker,
  #[serde(rename = "cardless_voter")]
  CardlessVoter,
  #[serde(rename = "vx-staff")]
  VxStaff,
  #[serde(rename = "system")]
  System,
  #[serde(rename = "unknown")]
  Unknown,
}

impl Display for LoggingUserRole {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.serialize(f)
  }
}

pub type LogDisposition = String;

#[derive(Serialize, Deserialize)]
pub struct CdfEvent {
  #[serde(rename = "@type")]
  cdf_type: CdfEventType,
  #[serde(rename = "Description")]
  description: Option<String>,
  #[serde(rename = "Details")]
  details: Option<String>,
  #[serde(rename = "Disposition")]
  disposition: CdfEventDispositionType,
  #[serde(rename = "Hash")]
  hash: Option<String>,
  #[serde(rename = "Id")]
  id: String,
  #[serde(rename = "OtherDisposition")]
  other_disposition: Option<String>,
  #[serde(rename = "Sequence")]
  sequence: String,
  #[serde(rename = "Severity")]
  severity: Option<String>,
  #[serde(rename = "TimeStamp")]
  time_stamp: String,
  #[serde(rename = "Type")]
  r#type: String,
  #[serde(rename = "UserId")]
  user_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub enum CdfEventType {
  #[serde(rename = "EventLogging.Event")]
  Event,
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Copy)]
pub enum CdfEventDispositionType {
  #[serde(rename = "failure")]
  Failure,
  #[serde(rename = "na")]
  Na,
  #[serde(rename = "other")]
  Other,
  #[serde(rename = "success")]
  Success,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct CdfElectionEventLog<Events>
where
  Events: Serialize,
{
  #[serde(rename = "@type")]
  cdf_type: CdfElectionEventLogType,
  generated_time: String,
  device: CdfDevice<Events>,
}

// impl<Events> Serialize for CdfElectionEventLog<Events>
// where
//   Events: IntoIterator<Item = CdfEvent>,
// {
//   fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
//   where
//     S: serde::Serializer,
//   {
//     let mut ser = serializer.serialize_struct("CdfElectionEventLog", 3)?;
//     ser.serialize_field("@type", &self.cdf_type)?;
//     ser.serialize_field("GeneratedTime", &self.generated_time)?;
//     ser.serialize_field("Device", &self.device)?;
//     ser.end()
//   }
// }

#[derive(Serialize, Deserialize)]
pub enum CdfElectionEventLogType {
  #[serde(rename = "EventLogging.ElectionEventLog")]
  ElectionEventLog,
}

#[derive(Serialize)]
pub struct CdfDevice<Events>
where
  Events: Serialize,
{
  cdf_type: CdfDeviceType,
  r#type: CdfEventLoggingDeviceType,
  version: Option<String>,
  event: Events,
}

#[derive(Serialize, Deserialize)]
pub enum CdfDeviceType {
  #[serde(rename = "EventLogging.Device")]
  Device,
}

/// Used in Device::Type to describe the type or usage of the device generating the event.
#[derive(Serialize, Deserialize)]
pub enum CdfEventLoggingDeviceType {
  /// Electronic adjudication function for reviewing absentee/mail-in ballots anomalies (blanks/overvotes/write-ins/unreadable ballots).
  #[serde(rename = "adjudication")]
  Adjudication,

  /// Devices for enabling a vote capture device (VCD) to display a ballot, possibly directly connected to the VCD or through a smart card interface.
  #[serde(rename = "ballot-activation")]
  BallotActivation,

  /// Marked ballot printing devices (voter facing).
  #[serde(rename = "ballot-printing")]
  BallotPrinting,

  /// On-demand blank ballot printers.
  #[serde(rename = "blank-ballot-printing")]
  BlankBallotPrinting,

  /// Ballot marking devices (voter facing).
  #[serde(rename = "bmd")]
  Bmd,

  /// Electronic voter stations, standalone or daisy chained to a DRE-controller (voter facing).
  #[serde(rename = "dre")]
  Dre,

  /// Network controller for electronic voting (poll worker facing).
  #[serde(rename = "dre-controller")]
  DreController,

  /// DREs, or other devices that store cast vote records electronically (voter facing).
  #[serde(rename = "electronic-cast")]
  ElectronicCast,

  /// DREs, or devices that store cast vote records electronically and also print a paper record (voter facing).
  #[serde(rename = "electronic-cast-paper")]
  ElectronicCastPaper,

  /// Electronic poll book devices.
  #[serde(rename = "electronic-poll-book")]
  ElectronicPollBook,

  /// Election management systems, including for pre- and post-election administration and reporting functions.
  #[serde(rename = "ems")]
  Ems,

  /// Used when no other value in this enumeration applies.
  #[serde(rename = "other")]
  Other,

  /// Scanning devices for batches of ballots, auto-feeding, e.g., Central Count (poll worker facing).
  #[serde(rename = "scan-batch")]
  ScanBatch,

  /// Scanning devices for single-sheets, e.g., Precinct Count (voter facing), but could be used for Central Count by an election official.
  #[serde(rename = "scan-single")]
  ScanSingle,

  /// Remote transmission hosts, e.g., for the receiving of unofficial results at a central location from a remote location (receiving station).
  #[serde(rename = "transmission-receiving")]
  TransmissionReceiving,

  /// Remote transmission clients, e.g., for sending of unofficial results from a remote location to a central location (sending station).
  #[serde(rename = "transmission-sending")]
  TransmissionSending,
}

pub struct VxLogReader<R: BufRead> {
  lines: Lines<R>,
  lineno: usize,
}

impl<R> VxLogReader<R>
where
  R: BufRead,
{
  pub fn new(lines: Lines<R>) -> Self {
    Self { lines, lineno: 0 }
  }
}

pub struct VxLogEntry {
  line: LogLine,
  lineno: usize,
}

impl<R> Iterator for VxLogReader<R>
where
  R: BufRead,
{
  type Item = VxLogEntry;

  fn next(&mut self) -> Option<Self::Item> {
    // TODO: don't just crash here
    let line = self.lines.next()?.unwrap();
    let lineno = self.lineno;
    self.lineno += 1;

    Some(VxLogEntry {
      line: serde_json::from_str::<LogLine>(&line).unwrap(),
      lineno,
    })
  }
}

impl TryFrom<VxLogEntry> for CdfEvent {
  type Error = napi::Error<napi::Status>;

  fn try_from(value: VxLogEntry) -> std::result::Result<Self, Self::Error> {
    let log_line = value.line;
    let lineno = value.lineno;
    let lineno0 = lineno - 1;

    let time_log_written = match log_line.extras.get("timeLogWritten") {
      Some(serde_json::Value::String(time_log_written)) => time_log_written,
      Some(_) => {
        return Err(Error::new(
          Status::InvalidArg,
          format!(
            "Error deserializing line {lineno}: entry 'timeLogWritten' property is not a string"
          ),
        ));
      }
      None => {
        return Err(Error::new(
          Status::InvalidArg,
          format!("Error deserializing line {lineno}: entry is missing 'timeLogWritten' property"),
        ));
      }
    };

    let disposition = if log_line.disposition == "" {
      CdfEventDispositionType::Na
    } else {
      serde_json::from_value::<CdfEventDispositionType>(serde_json::Value::String(
        log_line.disposition.clone(),
      ))
      .unwrap_or(CdfEventDispositionType::Other)
    };

    let mut details = log_line.extras.clone();
    details.insert(
      "source".to_owned(),
      serde_json::Value::String(log_line.source.to_string()),
    );
    Ok(CdfEvent {
      cdf_type: CdfEventType::Event,
      id: log_line.event_id.to_string(),
      disposition,
      other_disposition: if disposition == CdfEventDispositionType::Other {
        Some(log_line.disposition.clone())
      } else {
        None
      },
      sequence: lineno0.to_string(),
      time_stamp: time_log_written.to_owned(),
      r#type: log_line.event_type.to_string(),
      description: log_line.message,
      details: Some(serde_json::to_string(&details).map_err(|e| {
        Error::new(
          Status::InvalidArg,
          format!("Failed to serialize details for line {lineno}: {e}"),
        )
      })?),
      user_id: Some(log_line.user.to_string()),
      hash: None,
      severity: None,
    })
  }
}

pub fn write_as_json<I, P>(groups: I) -> impl Serialize
where
  I: IntoIterator<Item = P>,
  P: Serialize,
{
  struct Wrapper<T>(Cell<Option<T>>);

  impl<I, P> Serialize for Wrapper<I>
  where
    I: IntoIterator<Item = P>,
    P: Serialize,
  {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
      s.collect_seq(self.0.take().unwrap())
    }
  }

  Wrapper(Cell::new(Some(groups)))
}

#[napi]
pub fn export_log(source_path: String, output_path: String) -> Result<()> {
  let infile = std::fs::File::open(&source_path).map_err(|e| {
    Error::new(
      Status::InvalidArg,
      format!("Unable to open '{source_path}' for reading: {e}"),
    )
  })?;
  let reader = BufReader::new(infile);
  let log_reader = VxLogReader::new(reader.lines());

  let outfile = std::fs::OpenOptions::new()
    .create(true)
    .write(true)
    .open(&output_path)
    .map_err(|e| {
      Error::new(
        Status::InvalidArg,
        format!("Unable to open '{output_path}' for writing: {e}"),
      )
    })?;

  let buf_writer = BufWriter::new(outfile);

  let cdf_event_log = CdfElectionEventLog {
    cdf_type: CdfElectionEventLogType::ElectionEventLog,
    generated_time: chrono::offset::Utc::now().to_rfc3339(),
    device: CdfDevice {
      cdf_type: CdfDeviceType::Device,
      r#type: CdfEventLoggingDeviceType::Bmd,
      version: Some("TODO".to_owned()),
      event: write_as_json(log_reader.map(|log| CdfEvent::try_from(log).unwrap())),
    },
  };

  serde_json::to_writer(buf_writer, &cdf_event_log).unwrap();

  // serde_json::to_writer(buf_writer, &cdf_event_log).unwrap();

  // for entry in log_reader {
  //   let Some(time_log_written) = entry.line.extras.get("timeLogWritten") else {
  //     return Err(Error::new(
  //         Status::InvalidArg,
  //         format!("Error deserializing line {lineno} from '{source_path}': entry is missing 'timeLogWritten' property", lineno = lineno0 + 1)
  //     ));
  //   };

  //   let disposition = if entry.line.disposition == "" {
  //     CdfEventDispositionType::Na
  //   } else {
  //     serde_json::from_value::<CdfEventDispositionType>(serde_json::Value::String(
  //       entry.line.disposition.clone(),
  //     ))
  //     .unwrap_or(CdfEventDispositionType::Other)
  //   };

  //   let mut details = entry.line.extras.clone();
  //   details.insert("source".to_owned(), entry.line.source.to_string());

  //   let cdf_event = CdfEvent {
  //     cdf_type: CdfEventType::Event,
  //     id: log_line.event_id.to_string(),
  //     disposition,
  //     other_disposition: if disposition == CdfEventDispositionType::Other {
  //       Some(log_line.disposition.clone())
  //     } else {
  //       None
  //     },
  //     sequence: lineno0.to_string(),
  //     time_stamp: time_log_written.to_owned(),
  //     r#type: log_line.event_type.to_string(),
  //     description: log_line.message,
  //     details: Some(serde_json::to_string(&details).map_err(|e| {
  //       Error::new(
  //         Status::InvalidArg,
  //         format!(
  //           "Failed to serialize details for line {lineno} of '{source_path}': {e}",
  //           lineno = lineno0 + 1
  //         ),
  //       )
  //     })?),
  //     user_id: Some(log_line.user.to_string()),
  //     hash: None,
  //     severity: None,
  //   };
  // }

  Ok(())
}
