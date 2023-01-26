import {
  BaseCoder,
  BitLength,
  Coder,
  CoderError,
  CoderType,
  DecodeResult,
  EncodeResult,
  literal,
  message,
  padding,
  uint1,
  uint16,
  uint2,
  uint24,
  uint32,
  Uint8,
  uint8,
  unboundedString,
} from '@votingworks/message-coder';
import {
  err,
  isResult,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { Buffer } from 'buffer';
import { Optional } from '@votingworks/types';
import { debug as baseDebug } from './debug';
import {
  AckResponse,
  CheckAnswerResult,
  BitType,
  ColorMode,
  DataResponse,
  Device,
  ErrorCode,
  ErrorResponse,
  FormMovement,
  ImageResolution,
  ReleaseType,
  ResponseErrorCode,
  ScanSide,
  UltrasonicSensorLevelInternal,
  FormStanding,
} from './types';

const debug = baseDebug.extend('protocol');

/// Basic Protocol ///

/**
 * Generic acknowledgement response encoder/decoder.
 */
export const AckResponseMessage: Coder<AckResponse> = message({
  header: literal('STA', 0x00, 'A', 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Scanner response data encoder/decoder.
 */
export const DataResponseMessage: Coder<DataResponse> = message({
  header: literal('CDAT'),
  data: unboundedString(),
});

/**
 * Generic acknowledgement response encoder/decoder.
 */
export const ErrorResponseMessage: Coder<ErrorResponse> = message({
  header: literal('STA', 0x00, 'E', 0x00, 0x00),
  errorCode: uint8(),
});

/**
 * Job create request.
 */
export const JobCreateRequest = literal('JOB', 0x00, 'C', 0x00, 0x00, 0x00);

/**
 * Job end request.
 */
export const JobEndRequest = message({
  header: literal('JOB', 0x00, 'E', 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Internal status message encoder/decoder.
 */
export const StatusInternalMessage = message({
  code: uint32(),
  pageNumSideA: uint16(),
  pageNumSideB: uint16(),
  validPageSizeA: uint32(),
  validPageSizeB: uint32(),
  imageWidthA: uint16(),
  imageWidthB: uint16(),
  imageHeightA: uint16(),
  imageHeightB: uint16(),
  endPageA: uint8(),
  endPageB: uint8(),
  endScanA: uint8(),
  endScanB: uint8(),
  ultrasonic: uint8(),
  paperJam: uint8(),
  coverOpen: uint8(),
  cancel: uint8(),
  key: uint8(),
  motorMove: uint8(),
  adfSensor: uint8(),
  docSensor: uint8(),
  homeSensor: uint8(),
  jobOwner: uint8(),
  reserve1: uint16(),
  reserve2: uint32(),
  jobState: uint32(),
});

/**
 * Internal status struct type.
 */
export type StatusInternalMessage = CoderType<typeof StatusInternalMessage>;

/**
 * Release version request.
 */
export const ReleaseVersionRequest = message({
  header: literal('CAP', 0x00, 0x1c, 0x00),
  releaseType: uint8(),
  reserved: literal(0x00),
});

/**
 * Internal status request.
 */
export const StatusInternalRequest = message({
  header: literal('INFO', 0x30, 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Form movement request.
 */
export const FormMovementRequest = message({
  header: literal('MOTO', 0x00, 0x00),
  movement: uint8(),
  jobId: uint8(),
});

/**
 * Set scan parameters request.
 */
export const SetScanParametersRequest = message({
  header: literal('PAR', 0x00),
  length: literal(40, 0x00),
  code: literal(0x00),
  jobId: uint8(),
});

/**
 * Set scan parameters request type.
 */
export type SetScanParametersRequest = CoderType<
  typeof SetScanParametersRequest
>;

/**
 * Set scan parameters command data.
 */
export const SetScanParametersRequestData = message({
  /** Bytes 0-3 hardcoded to 'ADF\0' per docs. */
  source: literal('ADF', 0x00),

  /** Byte 4.4-4.7 */
  byte4Unused: padding(4),

  /**
   * Byte 4.3 (0x08) ACQ_BACK_SCAN – motor reverse scan.
   */
  acquireBackScan: uint1(),

  /**
   * Byte 4.2 (0x04) ACQ_NO_SHADING – disable sharing data applied.
   */
  acquireNoShading: uint1(),

  /**
   * Byte 4.1 (0x02) ACQ_NO_MIRROR – force the photo sensor pixel output without
   * mirror correction.
   */
  acquireNoMirror: uint1(),

  /**
   * Byte 4.0 (0x01) ACQ_PAGE_READ – wait for one page to read, not block read.
   */
  acquirePageRead: uint1(),

  /** Byte 5.7 */
  byte5Unused: padding(1),

  /**
   * Byte 5.6 (0x40) ACQ_DETECT_BW – ISP: auto-threshold.
   */
  acquireAuthThreshold: uint1(),

  /**
   * Byte 5.5 (0x20) ACQ_DETECT_COLOR – ISP: detect scan image as color or gray
   * target.
   */
  acquireDetectColor: uint1(),

  /**
   * Byte 5.4 (0x10) ACQ_AUTO_LEVEL – ISP: auto-histogram with Y channel.
   */
  acquireAutoLevel: uint1(),

  /**
   * Byte 5.3 (0x08) ACQ_AUTO_COLOR – ISP: auto-histogram with RGB channel.
   */
  acquireAutoColor: uint1(),

  /**
   * Byte 5.2 (0x04) ACQ_LEFT_ALIGN – ISP: crop the image to align to left.
   */
  acquireLeftAlign: uint1(),

  /**
   * Byte 5.1 (0x02) ACQ_PAGE_FILL – ISP: fulfill the blank area of crop image.
   */
  acquirePageFill: uint1(),

  /**
   * Byte 5.0 (0x01) ACQ_CROP_DESKEW – ISP: enable crop-de-skew function.
   */
  acquireCropDeskew: uint1(),

  /** Byte 6.5-6.7 */
  byte6Padding: padding(3),

  /**
   * Byte 6.4 (0x10) ACQ_PSEUDO_SENSOR – simulate ADF scan with pseudo ADF
   * sensor.
   */
  acquirePseudoSensor: uint1(),

  /**
   * Byte 6.3 (0x08) ACQ_TEST_PATTERN – test pattern image.
   */
  acquireTestPattern: uint1(),

  /**
   * Byte 6.2 (0x04) ACQ_LAMP_OFF – scan with the lamp off.
   */
  acquireLampOff: uint1(),

  /**
   * Byte 6.1 (0x02) ACQ_NO_PAPER_SENSOR – ADF scan without doc/ADF sensor.
   */
  acquireNoPaperSensor: uint1(),

  /**
   * Byte 6.0 (0x01) ACQ_MOTOR_OFF – scan without moving motor.
   */
  acquireMotorOff: uint1(),

  /** Byte 7 */
  byte7Unused: padding(8),

  /** Byte 8.6 (0x40) and 8.7 (0x80) */
  ultrasonicSensorLevel: uint2<UltrasonicSensorLevelInternal>(
    UltrasonicSensorLevelInternal
  ),

  /** Byte 8.5 (0x20) */
  disableUltrasonicSensor: uint1(),

  /** Byte 8.4 (0x10) */
  disableHardwareDeskew: uint1(),

  /** Byte 8.3-8.2 (0x0c) */
  byte8Bit5Unused: padding(2),

  /**
   * Byte 8.1-8.0 (0x03) controls the form standing after scanning.
   */
  formStandingAfterScan: uint2<FormStanding>(FormStanding),

  /** Byte 9 */
  byte9Unused: padding(8),

  /** Byte 10 controls which sides of the page to scan (A/B/both). */
  wantedScanSide: uint8<ScanSide>(ScanSide),

  /** Byte 11 hardcoded to 1 per the docs. */
  pagesToScan: literal(0x01),

  /** Bytes 12-15 hardcoded to "RAW\0". Alternatively, use "JPG\0". */
  scanFormat: literal('RAW', 0x00),

  /** Bytes 16-17 are JPEG image quality options which we don't use. */
  imageOptions: literal(0x00, 0x00),

  /** Byte 18 is the bit type, i.e. color & color depth. */
  bitType: uint8<BitType>(BitType),

  /** Byte 19 determines which sensors are used to scan. */
  colorMode: uint8<ColorMode>(ColorMode),

  /**
   * Bytes 20-21 set resolution for the x-axis. Set the same value for
   * `resolutionY`.
   */
  resolutionX: uint16<ImageResolution>(ImageResolution),

  /**
   * Bytes 22-23 set resolution for the y-axis. Set the same value for
   * `resolutionX`.
   */
  resolutionY: uint16<ImageResolution>(ImageResolution),

  /**
   * Bytes 24-27 set the left margin or x-offset.
   */
  offsetX: uint32(),

  /**
   * Bytes 28-31 set the top margin or y-offset.
   */
  offsetY: uint32(),

  /**
   * Bytes 32-35 set the width of the image.
   */
  imageWidth: uint32(),

  /**
   * Bytes 36-39 set the height of the image.
   */
  imageHeight: uint32(),
});

/**
 * Internal scan parameters type.
 */
export type ScanParametersInternal = CoderType<
  typeof SetScanParametersRequestData
>;

/**
 * Start scan request.
 */
export const StartScanRequest = message({
  header: literal('SCAN', 0x00, 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Start scan request.
 */
export const StopScanRequest = message({
  header: literal('STOP', 0x00, 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Map parameters request.
 */
export const MapParametersRequest = message({
  // Bytes 0-4 are "MAP\0P".
  header: literal('MAP', 0x00, 'P'),

  // Byte 5.7-5.2 are unused.
  byte5Padding: padding(6),

  // Byte 5.1 (0x02) is for side B.
  duplexSideB: uint1(),

  // Byte 5.0 (0x01) is for side A.
  duplexSideA: uint1(),

  // Byte 6.7-6.4 are unused.
  byte6Padding: padding(4),

  // Byte 6.3 (0x08) is for IR channel.
  irChannel: uint1(),

  // Byte 6.2 (0x04) is for blue channel.
  blueChannel: uint1(),

  // Byte 6.1 (0x02) is for green channel.
  greenChannel: uint1(),

  // Byte 6.0 (0x01) is for red channel.
  redChannel: uint1(),

  // Byte 7 is for job ID.
  jobId: uint8(),
});

/**
 * Map parameters request data.
 */
export const MapParametersRequestData = message({
  // Bytes 0-1 are for black clip level.
  // Clip to black if less than this value (0-256).
  blackClipLevel: uint16(),

  // Bytes 2-3 are for white clip level.
  // Clip to white if greater than this value (0-256).
  whiteClipLevel: uint16(),

  // Byte 4 is for gamma10.
  // Specify gamma value to build map curve (16 means 1.6, 20 means 2.0).
  gamma10: uint8(),
});

/**
 * Hardware reset request.
 */
export const HardwareResetRequest = message({
  header: literal('PWR', 0x00, 0x00, 0x00, 0x00),
  jobId: uint8(),
});

class GetImageDataRequestScanSideCoder extends BaseCoder<ScanSide> {
  private readonly internalCoder = uint8();

  private static readonly SideA = 0x0;
  private static readonly SideB = 0x1;

  bitLength(): BitLength {
    return 8;
  }

  encodeInto(value: ScanSide, buffer: Buffer, bitOffset: number): EncodeResult {
    if (value !== ScanSide.A && value !== ScanSide.B) {
      return err('InvalidValue');
    }

    return this.internalCoder.encodeInto(
      value === ScanSide.A
        ? GetImageDataRequestScanSideCoder.SideA
        : GetImageDataRequestScanSideCoder.SideB,
      buffer,
      bitOffset
    );
  }

  decodeFrom(buffer: Buffer, bitOffset: number): DecodeResult<ScanSide> {
    const decodeResult = this.internalCoder.decodeFrom(buffer, bitOffset);

    if (decodeResult.isErr()) {
      return decodeResult;
    }

    const decoded = decodeResult.ok();

    switch (decoded.value) {
      case GetImageDataRequestScanSideCoder.SideA:
        return ok({ value: ScanSide.A, bitOffset: decoded.bitOffset });

      case GetImageDataRequestScanSideCoder.SideB:
        return ok({ value: ScanSide.B, bitOffset: decoded.bitOffset });

      default:
        return err('InvalidValue');
    }
  }
}

/**
 * Get image data request.
 */
export const GetImageDataRequest = message({
  header: literal('IMG', 0x00),
  length: uint24(),
  scanSide: new GetImageDataRequestScanSideCoder(),
});

/// Request & Response ///

const DEFAULT_MAX_READ_LENGTH = 30;

const REQUEST_CODERS = {
  JobCreateRequest,
  JobEndRequest,
  GetImageDataRequest,
  SetScanParametersRequest,
  SetScanParametersRequestData,
  StartScanRequest,
  StopScanRequest,
  HardwareResetRequest,
  FormMovementRequest,
  StatusInternalRequest,
  ReleaseVersionRequest,
  MapParametersRequest,
  MapParametersRequestData,
} as const;

const RESPONSE_CODERS = {
  AckResponseMessage,
  ErrorResponseMessage,
  DataResponseMessage,
  StatusInternalMessage,
} as const;

/**
 * All possible scanner requests.
 */
export type AnyRequest = {
  [K in keyof typeof REQUEST_CODERS]: {
    type: K;
    value: CoderType<(typeof REQUEST_CODERS)[K]>;
    coder: (typeof REQUEST_CODERS)[K];
  };
}[keyof typeof REQUEST_CODERS];

/**
 * All possible scanner responses.
 */
export type AnyResponse = {
  [K in keyof typeof RESPONSE_CODERS]: {
    type: K;
    value: CoderType<(typeof RESPONSE_CODERS)[K]>;
    coder: (typeof RESPONSE_CODERS)[K];
  };
}[keyof typeof RESPONSE_CODERS];

/**
 * Parse a request to the scanner.
 */
export function parseRequest(data: Buffer): Optional<AnyRequest> {
  for (const [name, coder] of Object.entries(REQUEST_CODERS)) {
    const result = coder.decode(data);

    if (result.isOk()) {
      return {
        type: name,
        value: result.ok(),
        coder,
      } as unknown as AnyRequest;
    }
  }

  return undefined;
}

/**
 * Parse a response from the scanner.
 */
export function parseResponse(data: Buffer): Optional<AnyResponse> {
  for (const [name, coder] of Object.entries(RESPONSE_CODERS)) {
    const result = coder.decode(data);

    if (result.isOk()) {
      return {
        type: name,
        value: result.ok(),
        coder,
      } as unknown as AnyResponse;
    }
  }

  return undefined;
}

/**
 * Checks for an answer from the scanner.
 */
export function checkAnswer(data: Buffer): CheckAnswerResult {
  debug('parseResponse data=%o', data);
  debug('attempting to parse as ack');
  const ack = AckResponseMessage.decode(data);

  if (ack.isOk()) {
    const { jobId } = ack.ok();
    debug('parseResponse ack jobId=%x', jobId);
    return { type: 'ack', jobId };
  }

  debug('parsing as ack failed, attempting to parse as error');
  const error = ErrorResponseMessage.decode(data);

  if (error.isOk()) {
    const { errorCode } = error.ok();
    debug(
      'parseResponse error=%s (%x)',
      ResponseErrorCode[errorCode],
      errorCode
    );
    switch (errorCode) {
      case ResponseErrorCode.FORMAT_ERROR:
        return {
          type: 'error',
          errorCode: ErrorCode.CommunicationUnknownError,
        };

      case ResponseErrorCode.INVALID_COMMAND:
        return { type: 'error', errorCode: ErrorCode.InvalidCommand };

      case ResponseErrorCode.INVALID_JOB_ID:
        return { type: 'error', errorCode: ErrorCode.JobNotValid };

      default:
        throwIllegalValue(errorCode);
    }
  }

  const dataResponse = DataResponseMessage.decode(data);

  if (dataResponse.isOk()) {
    const response = dataResponse.ok();
    debug('parseResponse data=%o', response.data);
    return { type: 'data', data: response.data };
  }

  debug('parseResponse other/unknown');
  return { type: 'other', buffer: data };
}

function mapCoderError<T>(result: Result<T, CoderError>): Result<T, ErrorCode> {
  if (result.isOk()) {
    return ok(result.ok());
  }

  const coderError = result.err();
  switch (coderError) {
    case 'InvalidValue':
      return err(ErrorCode.InvalidParameter);

    case 'SmallBuffer':
      return err(ErrorCode.SmallBuffer);

    case 'TrailingData':
      return err(ErrorCode.CommunicationUnknownError);

    case 'UnsupportedOffset':
      throw new Error(`BUG: unsupported offset`);

    default:
      throwIllegalValue(coderError);
  }
}

function mapResult<T, U>(
  result: Result<T, ErrorCode>,
  f: (value: T) => Result<U, ErrorCode>
): Result<U, ErrorCode>;
function mapResult<T, U>(
  result: Result<T, ErrorCode>,
  f: (value: T) => U
): Result<U, ErrorCode>;
function mapResult<T, U>(
  result: Result<T, ErrorCode>,
  f: (value: T) => Result<U, ErrorCode> | U
): Result<U, ErrorCode> {
  if (result.isErr()) {
    return result;
  }

  const value = result.ok();
  const mapped = f(value);
  return isResult(mapped) ? mapped : ok(mapped);
}

/**
 * Encodes and sends a request to the device. Does not handle locking the device,
 * so you need to do that yourself.
 */
export async function write<T extends object>(
  device: Device,
  requestCoder: Coder<T>,
  value: T
): Promise<Result<void, ErrorCode>> {
  const encoded = mapCoderError(requestCoder.encode(value));

  if (encoded.isErr()) {
    return encoded;
  }

  return await device.write(encoded.ok());
}

/**
 * Encodes and sends a request to the device, then decodes the response.
 */
export async function request<
  T extends object | void,
  R extends CheckAnswerResult['type']
>(
  device: Device,
  requestCoder: Coder<T>,
  value: T,
  maxLength: number,
  expectedResponseType: R
): Promise<Result<Extract<CheckAnswerResult, { type: R }>, ErrorCode>> {
  const encoded = mapCoderError(requestCoder.encode(value));

  if (encoded.isErr()) {
    return encoded;
  }

  const result = await device.writeRead(encoded.ok(), maxLength);

  if (result.isErr()) {
    return result;
  }

  const response = checkAnswer(result.ok());

  if (response.type === expectedResponseType) {
    return ok(response as Extract<CheckAnswerResult, { type: R }>);
  }

  return err(
    response.type === 'error'
      ? response.errorCode
      : ErrorCode.DeviceAnswerUnknown
  );
}

const MAX_GET_RELEASE_VERSION_RESPONSE_LENGTH = 100;

/**
 * Gets the release version of the specified type.
 */
export async function getReleaseVersion(
  device: Device,
  releaseType: ReleaseType
): Promise<Result<string, ErrorCode>> {
  debug(
    'getReleaseVersion releaseType=%s (%x)',
    ReleaseType[releaseType],
    releaseType
  );
  const result = await request(
    device,
    ReleaseVersionRequest,
    { releaseType },
    MAX_GET_RELEASE_VERSION_RESPONSE_LENGTH,
    'data'
  );

  return mapResult(result, ({ data }) => data);
}

const MAX_GET_STATUS_INTERNAL_RESPONSE_LENGTH = 0x30;

/**
 * Gets the internal status of the scanner.
 */
export async function getStatusInternal(
  device: Device,
  jobId: number
): Promise<Result<StatusInternalMessage, ErrorCode>> {
  debug('getStatusInternal jobId=%x', jobId);
  const result = await request(
    device,
    StatusInternalRequest,
    { jobId },
    MAX_GET_STATUS_INTERNAL_RESPONSE_LENGTH,
    'other'
  );

  return mapResult(result, ({ buffer }) =>
    mapCoderError(StatusInternalMessage.decode(buffer))
  );
}

/**
 * Create a new job.
 */
export async function createJob(
  device: Device
): Promise<Result<number, ErrorCode>> {
  debug('createJob');
  const result = await request(
    device,
    JobCreateRequest,
    undefined,
    DEFAULT_MAX_READ_LENGTH,
    'ack'
  );

  return mapResult(result, ({ jobId }) => jobId);
}

/**
 * End a job.
 */
export async function endJob(
  device: Device,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  debug('endJob jobId=%x', jobId);
  const result = await request(
    device,
    JobEndRequest,
    { jobId },
    DEFAULT_MAX_READ_LENGTH,
    'ack'
  );

  // drop the `jobId` from the response
  return mapResult(result, () => undefined);
}

/**
 * Move the form.
 */
export async function formMove(
  device: Device,
  jobId: number,
  movement: FormMovement
): Promise<Result<void, ErrorCode>> {
  debug(
    'formMove jobId=%x movement=%s (%x)',
    jobId,
    FormMovement[movement],
    movement
  );
  const result = await request(
    device,
    FormMovementRequest,
    { jobId, movement },
    DEFAULT_MAX_READ_LENGTH,
    'ack'
  );

  // drop the `jobId` from the response
  return mapResult(result, () => undefined);
}

/**
 * Set the scan parameters.
 */
export async function setScanParameters(
  device: Device,
  jobId: Uint8,
  scanParameters: ScanParametersInternal
): Promise<Result<void, ErrorCode>> {
  debug('setScanParameters');
  const writeSetScanParametersResult = await write(
    device,
    SetScanParametersRequest,
    { jobId }
  );

  if (writeSetScanParametersResult.isErr()) {
    return writeSetScanParametersResult;
  }

  const writeSetScanParametersBlockValuesResult = await write(
    device,
    SetScanParametersRequestData,
    scanParameters
  );

  if (writeSetScanParametersBlockValuesResult.isErr()) {
    return writeSetScanParametersBlockValuesResult;
  }

  const result = await device.read(DEFAULT_MAX_READ_LENGTH);

  if (result.isErr()) {
    return result;
  }

  const response = checkAnswer(result.ok());

  switch (response.type) {
    case 'ack':
      return ok();

    case 'error':
      return err(response.errorCode);

    default:
      return err(ErrorCode.DeviceAnswerUnknown);
  }
}

/**
 * Send start scan command.
 */
export async function startScan(
  device: Device,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  debug('startScan jobId=%x', jobId);
  const result = await request(
    device,
    StartScanRequest,
    { jobId },
    DEFAULT_MAX_READ_LENGTH,
    'ack'
  );

  // drop the `jobId` from the response
  return mapResult(result, () => undefined);
}

/**
 * Send stop scan command.
 */
export async function stopScan(
  device: Device,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  debug('stopScan jobId=%x', jobId);
  const result = await request(
    device,
    StopScanRequest,
    { jobId },
    DEFAULT_MAX_READ_LENGTH,
    'ack'
  );

  // drop the `jobId` from the response
  return mapResult(result, () => undefined);
}

/**
 * Send hardware reset command.
 */
export async function resetHardware(
  device: Device,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  debug('resetHardware jobId=%x', jobId);
  const result = await request(
    device,
    HardwareResetRequest,
    { jobId },
    DEFAULT_MAX_READ_LENGTH,
    'ack'
  );

  // drop the `jobId` from the response
  return mapResult(result, () => undefined);
}

/**
 * Get image data.
 */
export async function getImageData(
  device: Device,
  length: number,
  scanSide: ScanSide
): Promise<Result<Buffer, ErrorCode>> {
  debug(
    'getImageData imageSize=%d (%x) scanSide=%s (%x)',
    length,
    length,
    ScanSide[scanSide],
    scanSide
  );
  const writeResult = await write(device, GetImageDataRequest, {
    length,
    scanSide,
  });

  if (writeResult.isErr()) {
    debug('getImageData write error: %o', writeResult.err());
    return writeResult;
  }

  let buffer = Buffer.alloc(0);

  do {
    debug('getImageData has read %d/%d bytes', buffer.byteLength, length);
    const readResult = await device.read(length - buffer.byteLength);

    if (readResult.isErr()) {
      debug('getImageData read error: %o', readResult.err());
      return readResult;
    }

    const readBuffer = readResult.ok();

    if (readBuffer.byteLength === 0) {
      debug('getImageData read 0 bytes, stopping');
      break;
    }

    if (ErrorResponseMessage.decode(readBuffer).isOk()) {
      debug('getImageData returned data is error response');
      return err(ErrorCode.ScannerError);
    }

    buffer = Buffer.concat([buffer, readBuffer]);
  } while (buffer.byteLength < length);

  return ok(buffer);
}
