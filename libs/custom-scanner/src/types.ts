import { Result } from '@votingworks/basics';
import { Buffer } from 'buffer';

/**
 * A value maybe wrapped in a `Promise`.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Types of releases for which the Custom scanner can return values.
 */
export enum ReleaseType {
  Model = 1,
  Firmware = 2,
  Hardware = 3,
  Capabilities = 4,
}

/**
 * Paper sensor status.
 */
export enum SensorStatus {
  // Sensor does not detect paper.
  NoPaper = 0,

  // Sensor detects paper.
  PaperPresent = 1,

  // Sensor is not available on this device.
  NotAvailable = 0xff,
}

/**
 * External-facing status of the scanner.
 */
export interface ScannerStatus {
  /// Sensor status

  /**
   * Input-far-right sensor status.
   */
  sensorInputRightRight: SensorStatus;

  /**
   * Input-center-right sensor status.
   */
  sensorInputCenterRight: SensorStatus;

  /**
   * Input-center-left sensor status.
   */
  sensorInputCenterLeft: SensorStatus;

  /**
   * Input-far-left sensor status.
   */
  sensorInputLeftLeft: SensorStatus;

  /**
   * Internal-input-left sensor status (for de-skewing).
   */
  sensorInternalInputLeft: SensorStatus;

  /**
   * Internal-input-right sensor status (for de-skewing).
   */
  sensorInternalInputRight: SensorStatus;

  /**
   * Output-far-right sensor status.
   */
  sensorOutputRightRight: SensorStatus;

  /**
   * Output-center-right sensor status.
   */
  sensorOutputCenterRight: SensorStatus;

  /**
   * Output-center-left sensor status.
   */
  sensorOutputCenterLeft: SensorStatus;

  /**
   * Output-far-left sensor status.
   */
  sensorOutputLeftLeft: SensorStatus;

  /// Other status

  /**
   * Indicates whether more than one sheet has been loaded.
   */
  isDoubleSheet: boolean;

  /**
   * Indicates that the scan operation has been canceled.
   */
  isScanCanceled: boolean;

  /**
   * Indicates that the scan operation is in progress.
   */
  isScanInProgress: boolean;

  /**
   * Indicates that the scanner is loading paper.
   */
  isLoadingPaper: boolean;

  /// Mechanical status

  /**
   * Indicates that the scanner cover is open.
   */
  isScannerCoverOpen: boolean;

  /**
   * Indicates that the scanner is jammed.
   */
  isPaperJam: boolean;

  /**
   * Indicates that the sheet to be scanned has been held back by the user.
   */
  isJamPaperHeldBack: boolean;

  /**
   * Indicates that the scanner engine is On.
   */
  isMotorOn: boolean;

  /**
   * Indicates that a ticket is present on the input scanner mouth, ready to be inserted into the scanner.
   * Ticket width doesn't matter: if TRUE, a ticket of any width is present on the central part of the scanner mouth.
   */
  isTicketOnEnterCenter: boolean;

  /**
   * Indicates that a large ticket is present on the input scanner mouth, ready to be inserted into the scanner.
   * Only for A4 scanners.
   */
  isTicketOnEnterA4: boolean;

  /**
   * Indicates that a ticket has been loaded by the scanner, and is present inside the scanner.
   */
  isTicketLoaded: boolean;

  /**
   * Indicates that a ticket is present on the back side of the scanner.
   */
  isTicketOnExit: boolean;

  /**
   * Void print head sensor status. Only for scanners that support print option.
   */
  sensorVoidPrintHead: SensorStatus;

  /**
   * TRUE if the void print head is ready to print. FALSE otherwise. For scanners that do not support the void print, please ignore this value.
   */
  isPrintHeadReady: boolean;

  /**
   * Indicates that the scanner external cover sensor is open.
   */
  isExternalCoverCloseSensor: boolean;
}

/**
 * Scanner status specific to the Custom A4 scanner.
 */
export interface ScannerA4Status {
  pageCountSideA: number;
  pageCountSideB: number;

  /** Size of the next image-part to be read from the scanner */
  pageSizeSideA: number;

  /** Size of the next image-part to be read from the scanner */
  pageSizeSideB: number;

  /** Width of the next image-part to be read from the scanner */
  imageWidthSideA: number;

  /** Width of the next image-part to be read from the scanner */
  imageWidthSideB: number;

  /** Height of the next image-part to be read from the scanner */
  imageHeightSideA: number;

  /** Height of the next image-part to be read from the scanner */
  imageHeightSideB: number;

  /** Indicates that the scan operation for side A is finished. */
  endScanSideA: boolean;

  /** Indicates that the scan operation for side B is finished. */
  endScanSideB: boolean;
}

/**
 * Errors that can occur when communicating with the device.
 */
export enum ErrorCode {
  /// All OK
  OK = 0,

  /// Scanner offline
  ScannerOffline = 1,

  /// Open device error. Device probably offline
  OpenDeviceError = 2,

  /// Invalid parameter
  InvalidParameter = 3,

  /// Small buffer
  SmallBuffer = 4,

  /// Null or invalid pointer
  NullPointer = 5,

  /// Library not initialized
  NotInitialized = 6,

  /// Invalid device ID
  InvalidDeviceId = 7,

  /// Device is closed.Did you forget ConnectScanner?
  DeviceNotOpened = 8,

  /// The device doesn't answer
  NoDeviceAnswer = 9,

  /// Write error
  WriteError = 10,

  /// Scan job not valid. Maybe a ConnectScanner is needed
  JobNotValid = 11,

  /// Scan job open error
  ScanJobOpenError = 12,

  /// Invalid command
  InvalidCommand = 13,

  /// Device answer unknown
  DeviceAnswerUnknown = 14,

  /// No document has been scanned for this side
  NoDocumentScanned = 15,

  /// Communication synchronization error
  SynchronizationError = 16,

  /// No document has been inserted to be scanned
  NoDocumentToBeScanned = 18,

  /// Paper jam
  PaperJam = 19,

  /// The paper has been held back by the user
  PaperHeldBack = 20,

  /// It was not possible to disengage the scanner from paper sheet
  ScannerJam = 21,

  /// Scanner answer is an error code
  ScannerError = 22,

  /// Communication unknown error
  CommunicationUnknownError = 23,

  /// The request is not supported by the current device. Request not available
  RequestNotSupported = 24,

  /// The library has already been initialized. Please de-initialize library before re-initialize it
  LibraryAlreadyInitialized = 25,

  /// The scanner is busy. Probably a scan job is in progress
  ScannerBusy = 26,

  /// Impossible to perform the requested operation. The scanner cover is open
  ErrCoverOpen = 27,

  /// Data returned by the last/current scan job are inconsistent
  ScanInconsistentData = 28,

  /// A trouble impeded to perform a correct scan. (Scan timeout or power supply error)
  ScanImpeded = 29,

  /// Magnetic ink character recognition failed. Data not found or not detected
  MicrNotFound = 30,

  /// Magnetic ink character recognition in progress.
  MicrDetectInProgress = 31,

  /// Upgrade File not found
  UpgradeFileOpenError = 32,

  /// Boot Image Tag missed
  UpgradeBootImageTagMissed = 33,

  /// Upgrade file accept length not match
  UpgradeAcceptLenNotMatch = 34,

  /// Upgrade file accept length not match
  UpgradeImageWriteError = 35,

  /// Upgrade error: checksum error
  UpgradeChecksumError = 36,

  /// Upgrade error: file inconsistent. Wrong file format
  UpgradeWrongFileFormatError = 37,

  /// Void ticket: paper not present on print head. Cannot continue
  VoidTicketNotPresent = 38,

  /// Void ticket: print head is down. This situation will cause troubles during the next scan job
  VoidPrintHeadError = 39,

  /// The data requested are no longer available
  RequestedDataNoLongerAvailable = 40,

  /// It is not possible to perform or complete the current operation. Scanner found double sheet
  DoubleSheet = 41,

  /// Impossible to perform the requested operation. The scanner external cover is open
  ExternalCoverOpen = 42,
}

/**
 * Document sensor status.
 */
export enum DocumentSensorStatus {
  ENCODER_ERROR = 0b00000001,
  DOUBLE_SHEET = 0b00000010,
  DESKEW_LEFT = 0b00000100,
  DESKEW_RIGHT = 0b00001000,
  INPUT_LEFT_LEFT = 0b00010000,
  INPUT_CENTER_LEFT = 0b00100000,
  INPUT_CENTER_RIGHT = 0b01000000,
  INPUT_RIGHT_RIGHT = 0b10000000,
}

/**
 * Home sensor status.
 */
export enum HomeSensorStatus {
  OUTPUT_LEFT_LEFT = 0x01,
  OUTPUT_CENTER_LEFT = 0x02,
  OUTPUT_CENTER_RIGHT = 0x04,
  OUTPUT_RIGHT_RIGHT = 0x08,
}

/**
 * Defines for Custom sensors. Bitmask for scanner answer
 */
export enum CustomSensorsBitmask {
  INTERNAL_LEFT = 0x04,
  INTERNAL_RIGHT = 0x08,
}

/**
 * Job state for Custom scanner.
 */
export enum JobStatus {
  SCAN = 0x00000001,
  CALIBRATION = 0x00000002,
  MULTI_SHEET_DETECTION = 0x00000004,
  FLASH_ACCESS = 0x00000008,
  ADF_LOAD_PAPER = 0x00010000, // (1 << 16)
  ADF_EJECT_PAPER = 0x00020000, // (2 << 16)
  ADF_RESET_HOME = 0x00040000, // (4 << 16)
  FLB_LOAD_PAPER = 0x00100000, // (1 << 20)
  FLB_EJECT_PAPER = 0x00200000, // (2 << 20)
  FLB_RESET_HOME = 0x00400000, // (4 << 20)
  TPA_LOAD_PAPER = 0x01000000, // (1 << 24)
  TPA_EJECT_PAPER = 0x02000000, // (2 << 24)
  TPA_RESET_HOME = 0x04000000, // (4 << 24)
  DUMMY = 0x80000000, // (8 << 28)
}

/**
 * Movement types the scanner can perform.
 */
export enum FormMovement {
  /**
   * Stop the motors
   */
  STOP = 0,

  /**
   * Load paper
   */
  LOAD_PAPER = 1,

  /**
   * Eject/move forward the paper form
   */
  EJECT_PAPER_FORWARD = 2,

  /**
   * Retract/move back the paper form
   */
  RETRACT_PAPER_BACKWARD = 3,
}

/**
 * How many bits and which colors are used when scanning.
 */
export enum BitType {
  /** Black and white */
  BlackAndWhite1bpp = 1,
  /** Gray scale */
  GrayScale8bpp = 8,
  /** @deprecated not supported */
  GrayScale16bpp = 16,
  /** RGB color */
  Color24bpp = 24,
  /** @deprecated not supported */
  Color48bpp = 48,
}

/**
 * What color mode sensors are used when scanning.
 */
export enum ColorMode {
  /** Color */
  Color = 0x00,
  /** Gray scale or black and white – RED channel only */
  RedOnly = 0x01,
  /** Gray scale or black and white – GREEN channel only */
  GreenOnly = 0x02,
  /** Gray scale or black and white – BLUE channel only */
  BlueOnly = 0x03,
  /** Infrared (IR) channel only */
  Infrared = 0x04,
  /** Ultraviolet (UV) channel only */
  Ultraviolet = 0x05,
  BlackAndWhite = 0x06,
  /** Gray scale – mixed channel analog */
  Gray = 0x07,
  /** Gray scale – mixed channel digital */
  GrayDigital = 0x08,
}

/**
 * Image color depth type, and color channels.
 */
export enum ImageColorDepthType {
  /** RED channel - 8 bit per pixel grey scale image */
  RedChannel8bpp = (ColorMode.RedOnly << 8) | BitType.GrayScale8bpp,

  /** GREEN channel - 8 bit per pixel grey scale image */
  GreenChannel8bpp = (ColorMode.GreenOnly << 8) | BitType.GrayScale8bpp,

  /** BLUE channel - 8 bit per pixel grey scale image */
  BlueChannel8bpp = (ColorMode.BlueOnly << 8) | BitType.GrayScale8bpp,

  /** 8 bit per pixel grey scale image */
  Grey8bpp = (ColorMode.Gray << 8) | BitType.GrayScale8bpp,

  /** 24 bit per pixel color image */
  Color24bpp = (ColorMode.Color << 8) | BitType.Color24bpp,

  /** 1 bit per pixel black and white image */
  BlackAndWhite = (ColorMode.Gray << 8) | BitType.BlackAndWhite1bpp,
}

/**
 * Scan side.
 */
export enum ScanSide {
  /** Front side */
  A = 1,

  /** Back side */
  B = 2,

  /** Scan on front and back side */
  A_AND_B = 3,
}

/**
 * Output image resolution
 */
export enum ImageResolution {
  /**
   * 200 dpi resolution
   */
  RESOLUTION_200_DPI = 200,

  /**
   * 300 dpi resolution
   */
  RESOLUTION_300_DPI = 300,

  /**
   * 600 dpi resolution
   */
  RESOLUTION_600_DPI = 600,
}

/**
 *  Output image format.
 */
export enum ImageFileFormat {
  /** Tiff image */
  Tiff = 0,

  /** Bmp image */
  Bmp = 1,

  /** Jpeg image */
  Jpeg = 2,
}

/**
 * Indicates where the paper form will be driven after the scan job.
 */
export enum FormStanding {
  /**
   * The scanned form will be held by the scanner.
   */
  HOLD_TICKET = 0x0,

  /**
   * The scanned form will be moved past the scanner (eject).
   */
  DRIVE_FORWARD = 0x1,

  /**
   * The scanned form will return back to the user (retract).
   */
  DRIVE_BACKWARD = 0x2,
}

/**
 * MultiSheetDetection sensor settings for double/multiple sheet loaded detection.
 */
export enum DoubleSheetDetectOpt {
  /** Turn OFF the double/multiple sheet detection */
  DetectOff = 0x3,

  /** Turn ON the double/multiple sheet detection, using VERY  HIGH sensor sensitivity */
  Level1 = 0x1,

  /** Turn ON the double/multiple sheet detection, using HIGH sensor sensitivity (Only supported by Scanner A4) */
  Level2 = 0x5,

  /** Turn ON the double/multiple sheet detection, using LOW sensor sensitivity (Only supported by Scanner A4) */
  Level3 = 0x9,

  /** Turn ON the double/multiple sheet detection, using VERY  LOW sensor sensitivity (Only supported by Scanner A4) */
  Level4 = 0xd,
}

/**
 * Internal enum for multi sheet detection sensor level.
 */
export enum MultiSheetDetectionSensorLevelInternal {
  Level1 = 0b00,
  Level2 = 0b01,
  Level3 = 0b10,
  Level4 = 0b11,
}

/**
 * Scanning parameters.
 */
export interface ScanParameters {
  /** Scan side: front, back or both */
  wantedScanSide: ScanSide;

  /** Image resolution */
  resolution: ImageResolution;

  /** Image color depth */
  imageColorDepth: ImageColorDepthType;

  /**
   * Select the behavior of the paper sheet after scan. Select whether to return
   * backward to the user, or to push it past the scanner, or to keep it hold
   * (waiting for a following backward or forward movement command).
   */
  formStandingAfterScan: FormStanding;

  /**
   * To set whether to enable (suggested option) or disable double/multiple
   * sheet detection. If Off, the scanner doesn't detect  multiple paper sheet
   * loading. Otherwise, the scanner uses ultrasonic sensor for double/multiple
   * paper sheet loading detection (suggested option). Values in \ref
   * DoubleSheetDetectOpt.
   */
  doubleSheetDetection: DoubleSheetDetectOpt;
}

/**
 * Structure containing the image read by the scanner, and its properties.
 */
export interface ImageFromScanner {
  /** Buffer containing the image read by the scanner. Must have been allocated by the calling process */
  imageBuffer: Buffer;

  /** Image width, in pixels */
  imageWidth: number;

  /** Image height, in pixels */
  imageHeight: number;

  /** Image color depth */
  imageDepth: ImageColorDepthType;

  /** Image file format */
  imageFormat: ImageFileFormat;

  /** Which scan side the image is referred to */
  scanSide: ScanSide;

  /** Image resolution */
  imageResolution: ImageResolution;
}

/**
 * A duplex IO channel is a low-level interface to send and receive data.
 */
export interface DuplexChannel {
  /**
   * Establishes a connection over the channel.
   */
  connect(): Promise<Result<void, ErrorCode>>;

  /**
   * Closes the connection.
   */
  disconnect(): Promise<void>;

  /**
   * Send data over the channel.
   */
  write(data: Buffer): Promise<Result<void, ErrorCode>>;

  /**
   * Read data over the channel.
   */
  read(maxLength: number): Promise<Result<Buffer, ErrorCode>>;
}

/**
 * Generic acknowledgement response.
 */
export interface AckResponse {
  jobId: number;
}

/**
 * Generic data response.
 */
export interface DataResponse {
  data: string;
}

/**
 * All possible scanner answers.
 */
export type CheckAnswerResult =
  | { type: 'ack'; jobId: number }
  | { type: 'error'; errorCode: ErrorCode }
  | { type: 'data'; data: string }
  | { type: 'other'; buffer: Buffer };

/**
 * Generic error response.
 */
export interface ErrorResponse {
  errorCode: ResponseErrorCode;
}

/**
 * Possible response errors.
 */
export enum ResponseErrorCode {
  /**
   * Wrong format of the answer from the scanner. Bad answer.
   */
  FORMAT_ERROR = 0,

  /**
   * Scanner answered "Invalid command".
   */
  INVALID_COMMAND = 0x80,

  /**
   * Scanner answered "Invalid Job ID".
   */
  INVALID_JOB_ID = 0x81,
}
