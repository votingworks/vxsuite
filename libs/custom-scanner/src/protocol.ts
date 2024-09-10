import {
  asyncResultBlock,
  err,
  ok,
  Optional,
  Result,
  resultBlock,
  throwIllegalValue,
} from '@votingworks/basics';
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
import { Buffer } from 'buffer';
import { debug as baseDebug } from './debug';
import {
  AckResponse,
  BitType,
  CheckAnswerResult,
  ColorMode,
  DataResponse,
  DuplexChannel,
  ErrorCode,
  ErrorResponse,
  FormMovement,
  FormStanding,
  ImageResolution,
  ReleaseType,
  ResponseErrorCode,
  ScanSide,
  MultiSheetDetectionSensorLevelInternal,
} from './types';

const debug = baseDebug.extend('protocol');

/**
 * Basic protocol for communicating with the scanner. This is a low-level
 * protocol that is used by the higher-level {@link CustomA4Scanner} class.
 *
 * See "Manuale comandi SCANNER.pdf" for details.
 */

/**
 * Generic acknowledgement response encoder/decoder.
 */
export const AckResponseMessage: Coder<AckResponse> = message({
  header: literal('STA', 0x00, 'A', 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Type used by {@link AckResponseMessage}.
 */
export type AckResponseMessage = CoderType<typeof AckResponseMessage>;

/**
 * Scanner response data encoder/decoder.
 */
export const DataResponseMessage: Coder<DataResponse> = message({
  header: literal('CDAT'),
  data: unboundedString(),
});

/**
 * Type used by {@link DataResponseMessage}.
 */
export type DataResponseMessage = CoderType<typeof DataResponseMessage>;

/**
 * Generic acknowledgement response encoder/decoder.
 */
export const ErrorResponseMessage: Coder<ErrorResponse> = message({
  header: literal('STA', 0x00, 'E', 0x00, 0x00),
  errorCode: uint8<ResponseErrorCode>(ResponseErrorCode),
});

/**
 * Type used by {@link ErrorResponseMessage}.
 */
export type ErrorResponseMessage = CoderType<typeof ErrorResponseMessage>;

/**
 * Job create request.
 */
export const JobCreateRequest = literal('JOB', 0x00, 'C', 0x00, 0x00, 0x00);

/**
 * Type used by {@link JobCreateRequest}.
 */
export type JobCreateRequest = CoderType<typeof JobCreateRequest>;

/**
 * Job end request.
 */
export const JobEndRequest = message({
  header: literal('JOB', 0x00, 'E', 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Type used by {@link JobEndRequest}.
 */
export type JobEndRequest = CoderType<typeof JobEndRequest>;

/**
 * Internal status message encoder/decoder.
 */
export const StatusInternalMessage = message({
  /**
   * Bytes 0-3 hardcoded to 'IDAT' per docs.
   */
  header: literal('IDAT'),

  /**
   * Bytes 4-5. The number of pages scanned on side A.
   */
  pageNumSideA: uint16(),

  /**
   * Bytes 6-7. The number of pages scanned on side B.
   */
  pageNumSideB: uint16(),

  /**
   * Bytes 8-11. How many bytes of side A image data are available for reading.
   * When this is 0, we've read all the data for side A.
   */
  validPageSizeA: uint32(),

  /**
   * Bytes 12-15. How many bytes of side B image data are available for reading.
   * When this is 0, we've read all the data for side B.
   */
  validPageSizeB: uint32(),

  /**
   * Bytes 16-17. How wide the image is on side A in pixels. This value will be
   * available as soon as any image data is available, and otherwise will be 0.
   */
  imageWidthA: uint16(),

  /**
   * Bytes 18-19. How wide the image is on side B in pixels. This value will be
   * available as soon as any image data is available, and otherwise will be 0.
   */
  imageWidthB: uint16(),

  /**
   * Bytes 20-21. How tall the image is on side A in pixels. This value will be
   * available once the entire image has been scanned, and otherwise will be 0.
   */
  imageHeightA: uint16(),

  /**
   * Bytes 22-23. How tall the image is on side B in pixels. This value will be
   * available once the entire image has been scanned, and otherwise will be 0.
   */
  imageHeightB: uint16(),

  /**
   * Byte 24. Per Custom docs, "'P' = end page A, 'p' = end page B".
   */
  endPageA: uint8(),

  /**
   * Byte 25. Per Custom docs, "'P' = end page A, 'p' = end page B".
   */
  endPageB: uint8(),

  /**
   * Byte 26. Per Custom docs, "'S' = end scan A, 'S' = end scan B".
   */
  endScanA: uint8(),

  /**
   * Byte 27. Per Custom docs, "'S' = end scan A, 'S' = end scan B".
   */
  endScanB: uint8(),

  /**
   * Byte 28. MultiSheetDetection status.
   */
  multiSheetDetection: uint8(),

  /**
   * Byte 29. 'J' if there is a paper jam, but which kind of jam depends on bit
   * 0 of byte 35: 0 = generic jam, 1 = encoder error (the paper was held back
   * during scanning).
   */
  paperJam: uint8(),

  /**
   * Byte 30. The scanner cover is open if this is non-zero.
   */
  coverOpen: uint8(),

  /**
   * Byte 31. 'C' if the scan was canceled.
   */
  cancel: uint8(),

  /**
   * Byte 32. Per Custom docs, "button press".
   */
  key: uint8(),

  /**
   * Byte 33. 'S' if scanning, 'M' if moving but not scanning.
   */
  motorMove: uint8(),

  /**
   * Byte 34. Not used.
   */
  adfSensor: uint8(),

  /**
   * Byte 35. Document sensor status.
   * Bit 0: 1 if encoder error (the paper was held back during scanning).
   * Bit 1: 1 if double sheet (more than one sheet was detected).
   * Bit 2: DL (deskew left).
   * Bit 3: DR (deskew right).
   * Bit 4: ILL (sensor detected paper at input left left).
   * Bit 5: ICL (sensor detected paper at input center left).
   * Bit 6: ICR (sensor detected paper at input center right).
   * Bit 7: IRR (sensor detected paper at input right right).
   */
  docSensor: uint8(),

  /**
   * Byte 36. Home sensor status.
   * Bit 0: OLL (sensor detected paper at output left left).
   * Bit 1: OCL (sensor detected paper at output center left).
   * Bit 2: OCR (sensor detected paper at output center right).
   * Bit 3: ORR (sensor detected paper at output right right).
   * Bits 4-7: Not used.
   */
  homeSensor: uint8(),

  /**
   * Byte 37. Job owner set to 0x01 if job ID is 0x01, which it always is.
   */
  jobOwner: uint8(),

  /**
   * Bytes 38-39. Not used.
   */
  reserve1: uint16(),

  /**
   * Bytes 40-43. Not used.
   */
  reserve2: uint32(),

  /**
   * Bytes 44-47. Per Custom docs, "Job state".
   */
  jobState: uint32(),
});

/**
 * Type used by {@link StatusInternalMessage}.
 */
export type StatusInternalMessage = CoderType<typeof StatusInternalMessage>;

/**
 * Release version request.
 */
export const ReleaseVersionRequest = message({
  header: literal('CAP', 0x00, 0x1c, 0x00),
  releaseType: uint8<ReleaseType>(ReleaseType),
  reserved: literal(0x00),
});

/**
 * Type used by {@link ReleaseVersionRequest}.
 */
export type ReleaseVersionRequest = CoderType<typeof ReleaseVersionRequest>;

/**
 * Internal status request.
 */
export const StatusInternalRequest = message({
  header: literal('INFO', 0x30, 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Type used by {@link StatusInternalRequest}.
 */
export type StatusInternalRequest = CoderType<typeof StatusInternalRequest>;

/**
 * Form movement request.
 */
export const FormMovementRequest = message({
  header: literal('MOTO', 0x00, 0x00),
  movement: uint8(),
  jobId: uint8(),
});

/**
 * Type used by {@link FormMovementRequest}.
 */
export type FormMovementRequest = CoderType<typeof FormMovementRequest>;

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
 * Type used by {@link SetScanParametersRequest}.
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
  multiSheetDetectionSensorLevel: uint2<MultiSheetDetectionSensorLevelInternal>(
    MultiSheetDetectionSensorLevelInternal
  ),

  /** Byte 8.5 (0x20) */
  disableMultiSheetDetectionSensor: uint1(),

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
 * Type used by {@link SetScanParametersRequestData}.
 */
export type SetScanParametersRequestData = CoderType<
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
 * Type used by {@link StartScanRequest}.
 */
export type StartScanRequest = CoderType<typeof StartScanRequest>;

/**
 * Start scan request.
 */
export const StopScanRequest = message({
  header: literal('STOP', 0x00, 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Type used by {@link StopScanRequest}.
 */
export type StopScanRequest = CoderType<typeof StopScanRequest>;

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
 * Type used by {@link MapParametersRequest}.
 */
export type MapParametersRequest = CoderType<typeof MapParametersRequest>;

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
 * Type used by {@link MapParametersRequestData}.
 */
export type MapParametersRequestData = CoderType<
  typeof MapParametersRequestData
>;

/**
 * Hardware reset request.
 */
export const HardwareResetRequest = message({
  header: literal('PWR', 0x00, 0x00, 0x00, 0x00),
  jobId: uint8(),
});

/**
 * Type used by {@link HardwareResetRequest}.
 */
export type HardwareResetRequest = CoderType<typeof HardwareResetRequest>;

class GetImageDataRequestScanSideCoder extends BaseCoder<ScanSide> {
  private readonly internalCoder = uint8();

  private static readonly SideA = 0x0;
  private static readonly SideB = 0x1;

  canEncode(value: unknown): value is ScanSide {
    return value === ScanSide.A || value === ScanSide.B;
  }

  default(): ScanSide {
    return ScanSide.A;
  }

  bitLength(): Result<BitLength, CoderError> {
    return ok(8);
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
    return resultBlock((fail) => {
      const decoded = this.internalCoder
        .decodeFrom(buffer, bitOffset)
        .okOrElse(fail);

      switch (decoded.value) {
        case GetImageDataRequestScanSideCoder.SideA:
          return { value: ScanSide.A, bitOffset: decoded.bitOffset };

        case GetImageDataRequestScanSideCoder.SideB:
          return { value: ScanSide.B, bitOffset: decoded.bitOffset };

        /* istanbul ignore next */
        default:
          return err('InvalidValue');
      }
    });
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

/**
 * Type of a get image data request.
 */
export type GetImageDataRequest = CoderType<typeof GetImageDataRequest>;

/// Request & Response ///

const DEFAULT_MAX_READ_LENGTH = 30;

/**
 * All possible scanner requests.
 */
export const REQUEST_CODERS = {
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

/**
 * All possible scanner responses.
 */
export const RESPONSE_CODERS = {
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

      /* istanbul ignore next */
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

    /* istanbul ignore next */
    default:
      throwIllegalValue(coderError);
  }
}

/**
 * Encodes and sends a request to the channel.
 */
export function sendRequest<T>(
  channel: DuplexChannel,
  requestCoder: Coder<T>,
  value: T
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock((fail) =>
    channel.write(mapCoderError(requestCoder.encode(value)).okOrElse(fail))
  );
}

/**
 * Encodes and sends a request to the channel, then decodes the response.
 */
export function sendRequestAndReadResponse<
  T extends object | void,
  R extends CheckAnswerResult['type'],
>(
  channel: DuplexChannel,
  requestCoder: Coder<T>,
  value: T,
  maxLength: number,
  expectedResponseType: R
): Promise<Result<Extract<CheckAnswerResult, { type: R }>, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    (await sendRequest(channel, requestCoder, value)).okOrElse(fail);

    const response = checkAnswer(
      (await channel.read(maxLength)).okOrElse(fail)
    );

    if (response.type === expectedResponseType) {
      return response as Extract<CheckAnswerResult, { type: R }>;
    }

    return err(
      response.type === 'error'
        ? response.errorCode
        : ErrorCode.DeviceAnswerUnknown
    );
  });
}

const MAX_GET_RELEASE_VERSION_RESPONSE_LENGTH = 100;

/**
 * Gets the release version of the specified type.
 */
export function getReleaseVersion(
  channel: DuplexChannel,
  releaseType: ReleaseType
): Promise<Result<string, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug(
      'getReleaseVersion releaseType=%s (%x)',
      ReleaseType[releaseType],
      releaseType
    );
    return (
      await sendRequestAndReadResponse(
        channel,
        ReleaseVersionRequest,
        { releaseType },
        MAX_GET_RELEASE_VERSION_RESPONSE_LENGTH,
        'data'
      )
    ).okOrElse(fail).data;
  });
}

const MAX_GET_STATUS_INTERNAL_RESPONSE_LENGTH = 0x30;

/**
 * Gets the internal status of the scanner.
 */
export function getStatusInternal(
  channel: DuplexChannel,
  jobId: number
): Promise<Result<StatusInternalMessage, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('getStatusInternal jobId=%x', jobId);
    const { buffer } = (
      await sendRequestAndReadResponse(
        channel,
        StatusInternalRequest,
        { jobId },
        MAX_GET_STATUS_INTERNAL_RESPONSE_LENGTH,
        'other'
      )
    ).okOrElse(fail);

    return mapCoderError(StatusInternalMessage.decode(buffer));
  });
}

/**
 * Create a new job.
 */
export function createJob(
  channel: DuplexChannel
): Promise<Result<number, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('createJob');
    return (
      await sendRequestAndReadResponse(
        channel,
        JobCreateRequest,
        undefined,
        DEFAULT_MAX_READ_LENGTH,
        'ack'
      )
    ).okOrElse(fail).jobId;
  });
}

/**
 * End a job.
 */
export function endJob(
  channel: DuplexChannel,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('endJob jobId=%x', jobId);
    (
      await sendRequestAndReadResponse(
        channel,
        JobEndRequest,
        { jobId },
        DEFAULT_MAX_READ_LENGTH,
        'ack'
      )
    ).okOrElse(fail);
  });
}

/**
 * Move the form.
 */
export function formMove(
  channel: DuplexChannel,
  jobId: number,
  movement: FormMovement
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug(
      'formMove jobId=%x movement=%s (%x)',
      jobId,
      FormMovement[movement],
      movement
    );
    (
      await sendRequestAndReadResponse(
        channel,
        FormMovementRequest,
        { jobId, movement },
        DEFAULT_MAX_READ_LENGTH,
        'ack'
      )
    ).okOrElse(fail);
  });
}

/**
 * Set the scan parameters.
 */
export function setScanParameters(
  channel: DuplexChannel,
  jobId: Uint8,
  scanParameters: SetScanParametersRequestData
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('setScanParameters');
    (await sendRequest(channel, SetScanParametersRequest, { jobId })).okOrElse(
      fail
    );
    (
      await sendRequestAndReadResponse(
        channel,
        SetScanParametersRequestData,
        scanParameters,
        DEFAULT_MAX_READ_LENGTH,
        'ack'
      )
    ).okOrElse(fail);
  });
}

/**
 * Send start scan command.
 */
export function startScan(
  channel: DuplexChannel,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('startScan jobId=%x', jobId);
    (
      await sendRequestAndReadResponse(
        channel,
        StartScanRequest,
        { jobId },
        DEFAULT_MAX_READ_LENGTH,
        'ack'
      )
    ).okOrElse(fail);
  });
}

/**
 * Send stop scan command.
 */
export function stopScan(
  channel: DuplexChannel,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('stopScan jobId=%x', jobId);
    (
      await sendRequestAndReadResponse(
        channel,
        StopScanRequest,
        { jobId },
        DEFAULT_MAX_READ_LENGTH,
        'ack'
      )
    ).okOrElse(fail);
  });
}

/**
 * Send hardware reset command.
 */
export function resetHardware(
  channel: DuplexChannel,
  jobId: number
): Promise<Result<void, ErrorCode>> {
  return asyncResultBlock(async (fail) => {
    debug('resetHardware jobId=%x', jobId);
    try {
      (
        await sendRequestAndReadResponse(
          channel,
          HardwareResetRequest,
          { jobId },
          DEFAULT_MAX_READ_LENGTH,
          'ack'
        )
      ).okOrElse(fail);
    } catch (error) {
      // we can ignore clearHalt exceptions here and assume the reset worked.
      if (
        !(error instanceof Error) ||
        !error.message.includes('clearHalt error')
      ) {
        throw error;
      }
      debug('ignoring clearHalt error after reset');
    }
  });
}

/**
 * Get image data.
 */
export async function getImageData(
  channel: DuplexChannel,
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
  const writeResult = await sendRequest(channel, GetImageDataRequest, {
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
    const readResult = await channel.read(length - buffer.byteLength);

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
