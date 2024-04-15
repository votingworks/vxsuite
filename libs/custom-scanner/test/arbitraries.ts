import { Uint8 } from '@votingworks/message-coder';
import {
  arbitraryUint16,
  arbitraryUint24,
  arbitraryUint32,
  arbitraryUint8,
} from '@votingworks/test-utils';
import * as fc from 'fast-check';
import {
  AckResponseMessage,
  AnyRequest,
  AnyResponse,
  DataResponseMessage,
  ErrorResponseMessage,
  FormMovementRequest,
  GetImageDataRequest,
  HardwareResetRequest,
  JobCreateRequest,
  JobEndRequest,
  MapParametersRequest,
  MapParametersRequestData,
  ReleaseVersionRequest,
  SetScanParametersRequest,
  SetScanParametersRequestData,
  StartScanRequest,
  StatusInternalMessage,
  StatusInternalRequest,
  StopScanRequest,
} from '../src/protocol';
import {
  BitType,
  ColorMode,
  DoubleSheetDetectOpt,
  ErrorCode,
  FormMovement,
  FormStanding,
  ImageColorDepthType,
  ImageResolution,
  ReleaseType,
  ResponseErrorCode,
  ScanParameters,
  ScanSide,
  MultiSheetDetectionSensorLevelInternal,
} from '../src/types';

/**
 * Builds an arbitrary job ID.
 */
export function arbitraryJobId(): fc.Arbitrary<Uint8> {
  return arbitraryUint8();
}

// eslint-disable-next-line vx/gts-no-return-type-only-generics -- there's no "numeric enum" type
function arbitraryNumericEnumValue<T extends number>(
  enumeration: object
): fc.Arbitrary<T> {
  return fc.constantFrom(
    ...Object.values(enumeration).filter(
      (v): v is number => typeof v === 'number'
    )
  ) as fc.Arbitrary<T>;
}

/**
 * Builds an arbitrary `ErrorCode` value.
 */
export function arbitraryErrorCode(): fc.Arbitrary<ErrorCode> {
  return arbitraryNumericEnumValue(ErrorCode);
}

/**
 * Builds an arbitrary `ResponseErrorCode` value.
 */
export function arbitraryResponseErrorCode(): fc.Arbitrary<ResponseErrorCode> {
  return arbitraryNumericEnumValue(ResponseErrorCode);
}

/**
 * Builds an arbitrary `FormStanding` value.
 */
export function arbitraryFormStanding(): fc.Arbitrary<FormStanding> {
  return arbitraryNumericEnumValue(FormStanding);
}

/**
 * Builds an arbitrary `FormMovement` value.
 */
export function arbitraryFormMovement(): fc.Arbitrary<FormMovement> {
  return arbitraryNumericEnumValue(FormMovement);
}

/**
 * Builds an arbitrary `MultiSheetDetectionSensorLevelInternal` value.
 */
export function arbitraryMultiSheetDetectionSensorLevelInternal(): fc.Arbitrary<MultiSheetDetectionSensorLevelInternal> {
  return arbitraryNumericEnumValue(MultiSheetDetectionSensorLevelInternal);
}

/**
 * Builds an arbitrary `ScanSide` value.
 */
export function arbitraryScanSide(): fc.Arbitrary<ScanSide> {
  return arbitraryNumericEnumValue(ScanSide);
}

/**
 * Builds an arbitrary `BitType` value.
 */
export function arbitraryBitType(): fc.Arbitrary<BitType> {
  return arbitraryNumericEnumValue(BitType);
}

/**
 * Builds an arbitrary `ColorMode` value.
 */
export function arbitraryColorMode(): fc.Arbitrary<ColorMode> {
  return arbitraryNumericEnumValue(ColorMode);
}

/**
 * Builds an arbitrary `ImageResolution` value.
 */
export function arbitraryImageResolution(): fc.Arbitrary<ImageResolution> {
  return arbitraryNumericEnumValue(ImageResolution);
}

/**
 * Builds an arbitrary `JobCreateRequest` object.
 */
export function arbitraryJobCreateRequest(): fc.Arbitrary<JobCreateRequest> {
  return fc.constant(undefined);
}

/**
 * Build an arbitrary `JobEndRequest` object.
 */
export function arbitraryJobEndRequest(): fc.Arbitrary<JobEndRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `GetImageDataRequest` object.
 */
export function arbitraryGetImageDataRequest(): fc.Arbitrary<GetImageDataRequest> {
  return fc.record({
    length: arbitraryUint24(),
    scanSide: fc.constantFrom(ScanSide.A, ScanSide.B),
  });
}

/**
 * Build an arbitrary `SetScanParametersRequest` object.
 */
export function arbitrarySetScanParametersRequest(): fc.Arbitrary<SetScanParametersRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `ReleaseType` value.
 */
export function arbitraryReleaseType(): fc.Arbitrary<ReleaseType> {
  return arbitraryNumericEnumValue(ReleaseType);
}

/**
 * Builds an arbitrary `DoubleSheetDetectOpt` value.
 */
export function arbitraryDoubleSheetDetectOpt(): fc.Arbitrary<DoubleSheetDetectOpt> {
  return arbitraryNumericEnumValue(DoubleSheetDetectOpt);
}

/**
 * Builds an arbitrary `ImageColorDepthType` value.
 */
export function arbitraryImageColorDepthType(): fc.Arbitrary<ImageColorDepthType> {
  return arbitraryNumericEnumValue(ImageColorDepthType);
}

/**
 * Build an arbitrary `ScanParameters` object.
 */
export function arbitraryScanParameters(): fc.Arbitrary<ScanParameters> {
  return fc.record({
    wantedScanSide: arbitraryScanSide(),
    resolution: arbitraryImageResolution(),
    imageColorDepth: arbitraryImageColorDepthType(),
    formStandingAfterScan: arbitraryFormStanding(),
    doubleSheetDetection: arbitraryDoubleSheetDetectOpt(),
  });
}

/**
 * Build an arbitrary `SetScanParametersRequestData` object.
 */
export function arbitrarySetScanParametersRequestData(): fc.Arbitrary<SetScanParametersRequestData> {
  return fc.record({
    acquireBackScan: fc.boolean(),
    acquireNoShading: fc.boolean(),
    acquireNoMirror: fc.boolean(),
    acquirePageRead: fc.boolean(),
    acquireAuthThreshold: fc.boolean(),
    acquireDetectColor: fc.boolean(),
    acquireAutoLevel: fc.boolean(),
    acquireAutoColor: fc.boolean(),
    acquireLeftAlign: fc.boolean(),
    acquirePageFill: fc.boolean(),
    acquireCropDeskew: fc.boolean(),
    acquirePseudoSensor: fc.boolean(),
    acquireTestPattern: fc.boolean(),
    acquireLampOff: fc.boolean(),
    acquireNoPaperSensor: fc.boolean(),
    acquireMotorOff: fc.boolean(),
    multiSheetDetectionSensorLevel:
      arbitraryMultiSheetDetectionSensorLevelInternal(),
    disableMultiSheetDetectionSensor: fc.boolean(),
    disableHardwareDeskew: fc.boolean(),
    formStandingAfterScan: arbitraryFormStanding(),
    wantedScanSide: arbitraryScanSide(),
    bitType: arbitraryBitType(),
    colorMode: arbitraryColorMode(),
    resolutionX: arbitraryImageResolution(),
    resolutionY: arbitraryImageResolution(),
    offsetX: arbitraryUint32(),
    offsetY: arbitraryUint32(),
    imageWidth: arbitraryUint32(),
    imageHeight: arbitraryUint32(),
  });
}

/**
 * Build an arbitrary `StartScanRequest` object.
 */
export function arbitraryStartScanRequest(): fc.Arbitrary<StartScanRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `StopScanRequest` object.
 */
export function arbitraryStopScanRequest(): fc.Arbitrary<StopScanRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `HardwareResetRequest` object.
 */
export function arbitraryHardwareResetRequest(): fc.Arbitrary<HardwareResetRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `FormMovementRequest` object.
 */
export function arbitraryFormMovementRequest(): fc.Arbitrary<FormMovementRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
    movement: arbitraryFormMovement(),
  });
}

/**
 * Build an arbitrary `StatusInternalRequest` object.
 */
export function arbitraryStatusInternalRequest(): fc.Arbitrary<StatusInternalRequest> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `ReleaseVersionRequest` object.
 */
export function arbitraryReleaseVersionRequest(): fc.Arbitrary<ReleaseVersionRequest> {
  return fc.record({
    releaseType: fc.constantFrom(
      ReleaseType.Firmware,
      ReleaseType.Hardware,
      ReleaseType.Model
    ),
  });
}

/**
 * Build an arbitrary `MapParametersRequest` object.
 */
export function arbitraryMapParametersRequest(): fc.Arbitrary<MapParametersRequest> {
  return fc.record({
    duplexSideA: fc.boolean(),
    duplexSideB: fc.boolean(),
    irChannel: fc.boolean(),
    blueChannel: fc.boolean(),
    greenChannel: fc.boolean(),
    redChannel: fc.boolean(),
    jobId: arbitraryJobId(),
  });
}

/**
 * Build an arbitrary `MapParametersRequestData` object.
 */
export function arbitraryMapParametersRequestData(): fc.Arbitrary<MapParametersRequestData> {
  return fc.record({
    blackClipLevel: arbitraryUint16(),
    whiteClipLevel: arbitraryUint16(),
    gamma10: arbitraryUint8(),
  });
}

/**
 * Builds an arbitrary request.
 */
export function arbitraryRequest(): fc.Arbitrary<AnyRequest> {
  return fc.oneof(
    arbitraryJobCreateRequest().map(
      (value) =>
        ({
          type: 'JobCreateRequest',
          coder: JobCreateRequest,
          value,
        }) as const
    ),
    arbitraryJobEndRequest().map(
      (value) =>
        ({
          type: 'JobEndRequest',
          coder: JobEndRequest,
          value,
        }) as const
    ),
    arbitraryGetImageDataRequest().map(
      (value) =>
        ({
          type: 'GetImageDataRequest',
          coder: GetImageDataRequest,
          value,
        }) as const
    ),
    arbitrarySetScanParametersRequest().map(
      (value) =>
        ({
          type: 'SetScanParametersRequest',
          coder: SetScanParametersRequest,
          value,
        }) as const
    ),
    arbitrarySetScanParametersRequestData().map(
      (value) =>
        ({
          type: 'SetScanParametersRequestData',
          coder: SetScanParametersRequestData,
          value,
        }) as const
    ),
    arbitraryStartScanRequest().map(
      (value) =>
        ({
          type: 'StartScanRequest',
          coder: StartScanRequest,
          value,
        }) as const
    ),
    arbitraryStopScanRequest().map(
      (value) =>
        ({
          type: 'StopScanRequest',
          coder: StopScanRequest,
          value,
        }) as const
    ),
    arbitraryHardwareResetRequest().map(
      (value) =>
        ({
          type: 'HardwareResetRequest',
          coder: HardwareResetRequest,
          value,
        }) as const
    ),
    arbitraryFormMovementRequest().map(
      (value) =>
        ({
          type: 'FormMovementRequest',
          coder: FormMovementRequest,
          value,
        }) as const
    ),
    arbitraryStatusInternalRequest().map(
      (value) =>
        ({
          type: 'StatusInternalRequest',
          coder: StatusInternalRequest,
          value,
        }) as const
    ),
    arbitraryReleaseVersionRequest().map(
      (value) =>
        ({
          type: 'ReleaseVersionRequest',
          coder: ReleaseVersionRequest,
          value,
        }) as const
    ),
    arbitraryMapParametersRequest().map(
      (value) =>
        ({
          type: 'MapParametersRequest',
          coder: MapParametersRequest,
          value,
        }) as const
    ),
    arbitraryMapParametersRequestData().map(
      (value) =>
        ({
          type: 'MapParametersRequestData',
          coder: MapParametersRequestData,
          value,
        }) as const
    )
  );
}

/**
 * Builds an arbitrary `AckResponseMessage` object.
 */
export function arbitraryAckResponseMessage(): fc.Arbitrary<AckResponseMessage> {
  return fc.record({
    jobId: arbitraryJobId(),
  });
}

/**
 * Builds an arbitrary `ErrorResponseMessage` object.
 */
export function arbitraryErrorResponseMessage(): fc.Arbitrary<ErrorResponseMessage> {
  return fc.record({
    errorCode: arbitraryResponseErrorCode(),
  });
}

/**
 * Builds an arbitrary `DataResponseMessage` object.
 */
export function arbitraryDataResponseMessage(): fc.Arbitrary<DataResponseMessage> {
  return fc.record({
    data: fc.string(),
  });
}

/**
 * Builds an arbitrary `StatusInternalMessage` object.
 */
export function arbitraryStatusInternalMessage(): fc.Arbitrary<StatusInternalMessage> {
  return fc.record({
    pageNumSideA: arbitraryUint16(),
    pageNumSideB: arbitraryUint16(),
    validPageSizeA: arbitraryUint32(),
    validPageSizeB: arbitraryUint32(),
    imageWidthA: arbitraryUint16(),
    imageWidthB: arbitraryUint16(),
    imageHeightA: arbitraryUint16(),
    imageHeightB: arbitraryUint16(),
    endPageA: arbitraryUint8(),
    endPageB: arbitraryUint8(),
    endScanA: arbitraryUint8(),
    endScanB: arbitraryUint8(),
    multiSheetDetection: arbitraryUint8(),
    paperJam: arbitraryUint8(),
    coverOpen: arbitraryUint8(),
    cancel: arbitraryUint8(),
    key: arbitraryUint8(),
    motorMove: arbitraryUint8(),
    adfSensor: arbitraryUint8(),
    docSensor: arbitraryUint8(),
    homeSensor: arbitraryUint8(),
    jobOwner: arbitraryUint8(),
    reserve1: arbitraryUint16(),
    reserve2: arbitraryUint32(),
    jobState: arbitraryUint32(),
  });
}

/**
 * Builds an arbitrary response.
 */
export function arbitraryResponse(): fc.Arbitrary<AnyResponse> {
  return fc.oneof(
    arbitraryAckResponseMessage().map(
      (value) =>
        ({
          type: 'AckResponseMessage',
          coder: AckResponseMessage,
          value,
        }) as const
    ),
    arbitraryErrorResponseMessage().map(
      (value) =>
        ({
          type: 'ErrorResponseMessage',
          coder: ErrorResponseMessage,
          value,
        }) as const
    ),
    arbitraryDataResponseMessage().map(
      (value) =>
        ({
          type: 'DataResponseMessage',
          coder: DataResponseMessage,
          value,
        }) as const
    ),
    arbitraryStatusInternalMessage().map(
      (value) =>
        ({
          type: 'StatusInternalMessage',
          coder: StatusInternalMessage,
          value,
        }) as const
    )
  );
}
