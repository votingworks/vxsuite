import { expect, test } from 'vitest';
import { err, ok, typedAs } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { arbitraryStatusInternalMessage } from '../test/arbitraries';
import { makeProtocolListeners } from '../test/helpers';
import { CustomA4Scanner } from './custom_a4_scanner';
import {
  ProtocolListeners,
  usbChannelWithMockProtocol,
  createDuplexChannelMock,
} from './mocks';
import {
  AckResponseMessage,
  ErrorResponseMessage,
  StatusInternalMessage,
} from './protocol';
import { convertFromInternalStatus } from './status';
import {
  DoubleSheetDetectOpt,
  ErrorCode,
  FormMovement,
  FormStanding,
  ImageColorDepthType,
  ImageFileFormat,
  ImageFromScanner,
  ImageResolution,
  ReleaseType,
  ResponseErrorCode,
  ScanSide,
} from './types';

const DEFAULT_STATUS: Readonly<StatusInternalMessage> =
  StatusInternalMessage.default();

/**
 * Builds an already-connected `CustomA4Scanner` with a mock `UsbChannel` that
 * uses the provided listeners to respond to protocol requests.
 */
async function scannerWithListeners(
  listeners: Partial<ProtocolListeners>
): Promise<CustomA4Scanner> {
  const usbChannelMock = usbChannelWithMockProtocol(listeners);
  const scanner = new CustomA4Scanner(usbChannelMock);
  expect(await scanner.connect()).toEqual(ok());
  return scanner;
}

test('connect/disconnect', async () => {
  const usbChannelMock = createDuplexChannelMock({});
  const scanner = new CustomA4Scanner(usbChannelMock);

  expect(await usbChannelMock.read(1)).toEqual(err(ErrorCode.ScannerOffline));
  expect(await usbChannelMock.write(Buffer.of(1))).toEqual(
    err(ErrorCode.ScannerOffline)
  );
  expect(await scanner.connect()).toEqual(ok());
  expect(await usbChannelMock.read(1)).toEqual(err(ErrorCode.NoDeviceAnswer));
  expect(await usbChannelMock.write(Buffer.of(1))).toEqual(ok());
  expect(await scanner.disconnect()).toBeUndefined();
  expect(await usbChannelMock.read(1)).toEqual(err(ErrorCode.ScannerOffline));
  expect(await usbChannelMock.write(Buffer.of(1))).toEqual(
    err(ErrorCode.ScannerOffline)
  );
});

test('getReleaseVersion', async () => {
  const scanner = await scannerWithListeners({
    onReleaseVersionRequest({ releaseType }) {
      expect(releaseType).toEqual(ReleaseType.Hardware);
      return ok({ data: '1.2.3' });
    },
  });

  expect(await scanner.getReleaseVersion(ReleaseType.Hardware)).toEqual(
    ok('1.2.3')
  );
});

test('getStatus', async () => {
  const internalStatus = fc.sample(arbitraryStatusInternalMessage(), 1)[0]!;
  const scanner = await scannerWithListeners({
    onStatusInternalRequest() {
      return ok(internalStatus);
    },
  });

  expect(await scanner.getStatus()).toEqual(
    ok(convertFromInternalStatus(internalStatus).status)
  );
});

test('getStatus error', async () => {
  const scanner = await scannerWithListeners({
    onStatusInternalRequest() {
      return err(ResponseErrorCode.INVALID_COMMAND);
    },
  });

  expect(await scanner.getStatus()).toEqual(err(ErrorCode.InvalidCommand));
});

test('scan creates new job if needed', async () => {
  const { onSetScanParametersRequestData, onJobCreateRequest } =
    makeProtocolListeners();

  onSetScanParametersRequestData
    .mockReturnValueOnce(err(ResponseErrorCode.INVALID_JOB_ID))
    .mockReturnValueOnce(undefined);

  onJobCreateRequest.mockReturnValueOnce(ok({ jobId: 0x01 }));

  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      return undefined;
    },

    onSetScanParametersRequestData,
    onJobCreateRequest,
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect(onJobCreateRequest).toHaveBeenCalledTimes(1);
  expect(onSetScanParametersRequestData).toHaveBeenCalledTimes(2);
  expect(scanResult).toEqual(err(expect.any(Number)));
});

test('scan creates new job if needed but fails if it cannot', async () => {
  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // no response expected
      return undefined;
    },

    onUnhandledRequest() {
      // fail all requests
      return err(ResponseErrorCode.INVALID_JOB_ID);
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect(scanResult).toEqual(err(ErrorCode.JobNotValid));
});

test('scan fails to start', async () => {
  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      return undefined;
    },

    onSetScanParametersRequestData() {
      return ok({ jobId: 0x01 });
    },

    onStartScanRequest() {
      return err(ResponseErrorCode.FORMAT_ERROR);
    },

    onStatusInternalRequest() {
      return ok({
        ...DEFAULT_STATUS,
      });
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect(scanResult).toEqual(err(ErrorCode.CommunicationUnknownError));
});

test('scan is canceled', async () => {
  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // no response expected
      return undefined;
    },

    onStatusInternalRequest() {
      return ok({
        ...DEFAULT_STATUS,
        cancel: 'C'.charCodeAt(0),
      });
    },

    onUnhandledRequest() {
      // fall back to a success response
      return ok(
        AckResponseMessage.encode({ jobId: 0x01 }).assertOk('encode failed')
      );
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect(scanResult).toEqual(err(ErrorCode.NoDocumentToBeScanned));
});

test('scan fails if the paper is held back', async () => {
  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // no response expected
      return undefined;
    },

    onStatusInternalRequest() {
      return ok({
        ...DEFAULT_STATUS,
        // paper is jammed
        paperJam: 'J'.charCodeAt(0),
        // paper is held back
        docSensor: 1,
      });
    },

    onUnhandledRequest() {
      // fall back to a success response
      return ok(
        AckResponseMessage.encode({ jobId: 0x01 }).assertOk('encode failed')
      );
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect(scanResult).toEqual(err(ErrorCode.PaperHeldBack));
});

test('scan fails if the paper is jammed', async () => {
  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // no response expected
      return undefined;
    },

    onStatusInternalRequest() {
      return ok({
        ...DEFAULT_STATUS,
        // paper is jammed
        paperJam: 'J'.charCodeAt(0),
        // paper is not held back
        docSensor: 0,
      });
    },

    onUnhandledRequest() {
      // fall back to a success response
      return ok(
        AckResponseMessage.encode({ jobId: 0x01 }).assertOk('encode failed')
      );
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect(scanResult).toEqual(err(ErrorCode.PaperJam));
});

test('scan fails if the motor is off and no scan is in progress for too long', async () => {
  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // no response expected
      return undefined;
    },

    onStatusInternalRequest() {
      return ok({
        ...DEFAULT_STATUS,
        // motor is off
        motorMove: 0,
      });
    },

    onUnhandledRequest() {
      // fall back to a success response
      return ok(
        AckResponseMessage.encode({ jobId: 0x01 }).assertOk('encode failed')
      );
    },
  });

  const scanResult = await scanner.scan(
    {
      wantedScanSide: ScanSide.A,
      resolution: ImageResolution.RESOLUTION_200_DPI,
      imageColorDepth: ImageColorDepthType.Grey8bpp,
      doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
      formStandingAfterScan: FormStanding.HOLD_TICKET,
    },
    {
      maxTimeoutNoMoveNoScan: 1,
    }
  );

  expect(scanResult).toEqual(err(ErrorCode.ScannerError));
});

test('scan fails if the status check fails 3 times (experimental)', async () => {
  const { onStatusInternalRequest } = makeProtocolListeners();

  onStatusInternalRequest.mockReturnValue(
    err(ResponseErrorCode.INVALID_COMMAND)
  );

  const scanner = await scannerWithListeners({
    onStatusInternalRequest,

    onSetScanParametersRequest() {
      // no response expected
      return undefined;
    },

    onUnhandledRequest() {
      // fall back to a success response
      return ok(
        AckResponseMessage.encode({ jobId: 0x01 }).assertOk('encode failed')
      );
    },
  });

  const scanResult = await scanner.scan(
    {
      wantedScanSide: ScanSide.A,
      resolution: ImageResolution.RESOLUTION_200_DPI,
      imageColorDepth: ImageColorDepthType.Grey8bpp,
      doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
      formStandingAfterScan: FormStanding.HOLD_TICKET,
    },
    {
      maxTimeoutNoMoveNoScan: 1,
    }
  );

  expect(scanResult).toEqual(err(expect.any(Number)));
  expect(onStatusInternalRequest).toHaveBeenCalledTimes(3);
});

test('scan success (side A only)', async () => {
  // create random bytes for the image
  const imageBytes = randomBytes(100);
  const chunkSize = 10;
  let imageBytesOffset = 0;

  let status:
    | 'pending'
    | 'configuring'
    | 'configured'
    | 'scanning'
    | 'finished' = 'pending';

  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // 1a. set scan parameters
      expect(status).toEqual('pending');
      status = 'configuring';
      // don't return a response here, do it in onSetScanParametersRequestData
      return undefined;
    },

    onSetScanParametersRequestData() {
      // 1b. set scan parameters
      expect(status).toEqual('configuring');
      status = 'configured';
      return ok({ jobId: 0x01 });
    },

    onStartScanRequest() {
      // 2. start scan
      expect(status).toEqual('configured');
      status = 'scanning';
      return ok({ jobId: 0x01 });
    },

    onStatusInternalRequest() {
      // 3. status request
      expect(status).toEqual('scanning');

      const remainingBytes = imageBytes.byteLength - imageBytesOffset;
      const hasFullImage = remainingBytes <= chunkSize;
      const isReadBufferEmpty = remainingBytes === 0;

      return ok({
        ...DEFAULT_STATUS,
        validPageSizeA: Math.min(remainingBytes, chunkSize),
        imageWidthA: 10,
        imageHeightA: hasFullImage ? 10 : 0,
        endScanA: isReadBufferEmpty ? 'S'.charCodeAt(0) : 0,
        motorMove: 'S'.charCodeAt(0),
      });
    },

    onGetImageDataRequest({ scanSide, length }) {
      // 4. get image data
      expect(status).toEqual('scanning');
      expect(scanSide).toEqual(ScanSide.A);
      expect(length).toBeGreaterThanOrEqual(1);

      if (imageBytesOffset < imageBytes.byteLength) {
        const offset = imageBytesOffset;
        imageBytesOffset += length;
        return ok(imageBytes.subarray(offset, offset + length));
      }

      return ok(
        ErrorResponseMessage.encode({
          errorCode: ResponseErrorCode.INVALID_COMMAND,
        }).assertOk('encode failed')
      );
    },

    onStopScanRequest() {
      expect(status).toEqual('scanning');
      status = 'finished';
      return ok({ jobId: 0x01 });
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect({ scanResult, status }).toEqual({
    scanResult: ok(
      typedAs<SheetOf<ImageFromScanner>>([
        {
          scanSide: ScanSide.A,
          imageBuffer: imageBytes,
          imageWidth: 10,
          imageHeight: 10,
          imageDepth: ImageColorDepthType.Grey8bpp,
          imageFormat: ImageFileFormat.Jpeg,
          imageResolution: ImageResolution.RESOLUTION_200_DPI,
        },
        {
          scanSide: ScanSide.B,
          imageBuffer: Buffer.alloc(0),
          imageWidth: 0,
          imageHeight: 0,
          imageDepth: ImageColorDepthType.Grey8bpp,
          imageFormat: ImageFileFormat.Jpeg,
          imageResolution: ImageResolution.RESOLUTION_200_DPI,
        },
      ])
    ),
    status: 'finished',
  });
});

test('scan success (side B only)', async () => {
  // create random bytes for the image
  const imageBytes = randomBytes(100);
  const chunkSize = 10;
  let imageBytesOffset = 0;

  let status:
    | 'pending'
    | 'configuring'
    | 'configured'
    | 'scanning'
    | 'finished' = 'pending';

  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // 1a. set scan parameters
      expect(status).toEqual('pending');
      status = 'configuring';
      // don't return a response here, do it in onSetScanParametersRequestData
      return undefined;
    },

    onSetScanParametersRequestData() {
      // 1b. set scan parameters
      expect(status).toEqual('configuring');
      status = 'configured';
      return ok({ jobId: 0x01 });
    },

    onStartScanRequest() {
      // 2. start scan
      expect(status).toEqual('configured');
      status = 'scanning';
      return ok({ jobId: 0x01 });
    },

    onStatusInternalRequest() {
      // 3. status request
      expect(status).toEqual('scanning');

      const remainingBytes = imageBytes.byteLength - imageBytesOffset;
      const hasFullImage = remainingBytes <= chunkSize;
      const isReadBufferEmpty = remainingBytes === 0;

      return ok({
        ...DEFAULT_STATUS,
        validPageSizeB: Math.min(remainingBytes, chunkSize),
        imageWidthB: 10,
        imageHeightB: hasFullImage ? 10 : 0,
        endScanB: isReadBufferEmpty ? 'S'.charCodeAt(0) : 0,
        motorMove: 'S'.charCodeAt(0),
      });
    },

    onGetImageDataRequest({ scanSide, length }) {
      // 4. get image data request
      expect(status).toEqual('scanning');
      expect(scanSide).toEqual(ScanSide.B);
      expect(length).toBeGreaterThanOrEqual(1);

      if (imageBytesOffset < imageBytes.byteLength) {
        const offset = imageBytesOffset;
        imageBytesOffset += length;
        return ok(imageBytes.subarray(offset, offset + length));
      }

      return ok(
        ErrorResponseMessage.encode({
          errorCode: ResponseErrorCode.INVALID_COMMAND,
        }).assertOk('encode failed')
      );
    },

    onStopScanRequest() {
      expect(status).toEqual('scanning');
      status = 'finished';
      return ok({ jobId: 0x01 });
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.B,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect({ scanResult, status }).toEqual({
    scanResult: ok(
      typedAs<SheetOf<ImageFromScanner>>([
        {
          scanSide: ScanSide.A,
          imageBuffer: Buffer.alloc(0),
          imageWidth: 0,
          imageHeight: 0,
          imageDepth: ImageColorDepthType.Grey8bpp,
          imageFormat: ImageFileFormat.Jpeg,
          imageResolution: ImageResolution.RESOLUTION_200_DPI,
        },
        {
          scanSide: ScanSide.B,
          imageBuffer: imageBytes,
          imageWidth: 10,
          imageHeight: 10,
          imageDepth: ImageColorDepthType.Grey8bpp,
          imageFormat: ImageFileFormat.Jpeg,
          imageResolution: ImageResolution.RESOLUTION_200_DPI,
        },
      ])
    ),
    status: 'finished',
  });
});

test('scan success (sides A & B)', async () => {
  // create random bytes for the image
  const imageBytesA = randomBytes(100);
  const imageBytesB = randomBytes(100);
  const chunkSize = 10;
  let imageBytesOffsetA = 0;
  let imageBytesOffsetB = 0;

  let status:
    | 'pending'
    | 'configuring'
    | 'configured'
    | 'scanning'
    | 'finished' = 'pending';

  const scanner = await scannerWithListeners({
    onSetScanParametersRequest() {
      // 1a. set scan parameters
      expect(status).toEqual('pending');
      status = 'configuring';
      // don't return a response here, do it in onSetScanParametersRequestData
      return undefined;
    },

    onSetScanParametersRequestData() {
      // 1b. set scan parameters
      expect(status).toEqual('configuring');
      status = 'configured';
      return ok({ jobId: 0x01 });
    },

    onStartScanRequest() {
      // 2. start scan
      expect(status).toEqual('configured');
      status = 'scanning';
      return ok({ jobId: 0x01 });
    },

    onStatusInternalRequest() {
      // 3. status request
      expect(status).toEqual('scanning');

      const remainingBytesA = imageBytesA.byteLength - imageBytesOffsetA;
      const remainingBytesB = imageBytesB.byteLength - imageBytesOffsetB;
      const hasFullImageA = remainingBytesA <= chunkSize;
      const hasFullImageB = remainingBytesB <= chunkSize;
      const isReadBufferEmptyA = remainingBytesA === 0;
      const isReadBufferEmptyB = remainingBytesB === 0;

      return ok({
        ...DEFAULT_STATUS,
        validPageSizeA: Math.min(remainingBytesA, chunkSize),
        validPageSizeB: Math.min(remainingBytesB, chunkSize),
        imageWidthA: 10,
        imageWidthB: 10,
        imageHeightA: hasFullImageA ? 10 : 0,
        imageHeightB: hasFullImageB ? 10 : 0,
        endScanA: isReadBufferEmptyA ? 'S'.charCodeAt(0) : 0,
        endScanB: isReadBufferEmptyB ? 'S'.charCodeAt(0) : 0,
        motorMove: 'S'.charCodeAt(0),
      });
    },

    onGetImageDataRequest({ scanSide, length }) {
      // 4. get image data request
      expect(status).toEqual('scanning');
      expect(scanSide).not.toEqual(ScanSide.A_AND_B);
      expect(length).toBeGreaterThanOrEqual(1);

      if (scanSide === ScanSide.A) {
        if (imageBytesOffsetA < imageBytesA.byteLength) {
          const offset = imageBytesOffsetA;
          imageBytesOffsetA += length;
          return ok(imageBytesA.subarray(offset, offset + length));
        }
      } else if (scanSide === ScanSide.B) {
        if (imageBytesOffsetB < imageBytesB.byteLength) {
          const offset = imageBytesOffsetB;
          imageBytesOffsetB += length;
          return ok(imageBytesB.subarray(offset, offset + length));
        }
      }

      return ok(
        ErrorResponseMessage.encode({
          errorCode: ResponseErrorCode.INVALID_COMMAND,
        }).assertOk('encode failed')
      );
    },

    onStopScanRequest() {
      expect(status).toEqual('scanning');
      status = 'finished';
      return ok({ jobId: 0x01 });
    },
  });

  const scanResult = await scanner.scan({
    wantedScanSide: ScanSide.A_AND_B,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    doubleSheetDetection: DoubleSheetDetectOpt.DetectOff,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
  });

  expect({ scanResult, status }).toEqual({
    scanResult: ok(
      typedAs<SheetOf<ImageFromScanner>>([
        {
          scanSide: ScanSide.A,
          imageBuffer: imageBytesA,
          imageWidth: 10,
          imageHeight: 10,
          imageDepth: ImageColorDepthType.Grey8bpp,
          imageFormat: ImageFileFormat.Jpeg,
          imageResolution: ImageResolution.RESOLUTION_200_DPI,
        },
        {
          scanSide: ScanSide.B,
          imageBuffer: imageBytesB,
          imageWidth: 10,
          imageHeight: 10,
          imageDepth: ImageColorDepthType.Grey8bpp,
          imageFormat: ImageFileFormat.Jpeg,
          imageResolution: ImageResolution.RESOLUTION_200_DPI,
        },
      ])
    ),
    status: 'finished',
  });
});

test('move motor', async () => {
  const scanner = await scannerWithListeners({
    onFormMovementRequest({ movement }) {
      expect(movement).toEqual(FormMovement.EJECT_PAPER_FORWARD);
      return ok({ jobId: 0x01 });
    },

    onJobCreateRequest() {
      return ok({ jobId: 0x01 });
    },
  });

  expect(await scanner.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(ok());
});

test('move motor retries once on job error', async () => {
  const { onFormMovementRequest, onJobCreateRequest } = makeProtocolListeners();

  onFormMovementRequest
    .mockReturnValueOnce(err(ResponseErrorCode.INVALID_JOB_ID))
    .mockReturnValueOnce(ok({ jobId: 0x01 }));
  onJobCreateRequest
    .mockReturnValueOnce(ok({ jobId: 0x01 }))
    .mockReturnValueOnce(ok({ jobId: 0x01 }));

  const scanner = await scannerWithListeners({
    onFormMovementRequest,
    onJobCreateRequest,
  });

  expect(await scanner.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(ok());
});

test('move motor gives up if it cannot create a job', async () => {
  const { onFormMovementRequest, onJobCreateRequest, onJobEndRequest } =
    makeProtocolListeners();

  onFormMovementRequest.mockReturnValueOnce(
    err(ResponseErrorCode.INVALID_COMMAND)
  );
  onJobCreateRequest.mockReturnValue(err(ResponseErrorCode.INVALID_JOB_ID));
  onJobEndRequest.mockReturnValue(ok({ jobId: 0x01 }));

  const scanner = await scannerWithListeners({
    onFormMovementRequest,
    onJobCreateRequest,
    onJobEndRequest,
  });

  expect(await scanner.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(
    err(ErrorCode.JobNotValid)
  );
});

test('move motor never retries on non-job errors', async () => {
  const { onFormMovementRequest, onJobCreateRequest } = makeProtocolListeners();

  onFormMovementRequest.mockReturnValueOnce(
    err(ResponseErrorCode.FORMAT_ERROR)
  );

  onJobCreateRequest.mockReturnValueOnce(ok({ jobId: 0x01 }));

  const scanner = await scannerWithListeners({
    onFormMovementRequest,
    onJobCreateRequest,
  });

  expect(await scanner.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(
    err(ErrorCode.CommunicationUnknownError)
  );
});

test('move motor with stop movement short-circuits', async () => {
  const { onFormMovementRequest, onJobCreateRequest } = makeProtocolListeners();

  onJobCreateRequest.mockReturnValueOnce(ok({ jobId: 0x01 }));

  const scanner = await scannerWithListeners({
    onFormMovementRequest,
    onJobCreateRequest,
  });

  expect(await scanner.move(FormMovement.STOP)).toEqual(ok());
  expect(onFormMovementRequest).not.toHaveBeenCalled();
});

test('resetHardware', async () => {
  const scanner = await scannerWithListeners({
    onHardwareResetRequest() {
      return ok({ jobId: 0x01 });
    },
  });

  expect(await scanner.resetHardware()).toEqual(ok());
});

test('scanner commands wait for each other', async () => {
  const events: string[] = [];

  const scanner = await scannerWithListeners({
    onFormMovementRequest({ movement }) {
      events.push(`move request: ${FormMovement[movement]}`);
      return ok({ jobId: 0x01 });
    },

    onJobCreateRequest() {
      return ok({ jobId: 0x01 });
    },
  });

  events.push(`trigger move 1`);
  const move1Promise = scanner
    .move(FormMovement.EJECT_PAPER_FORWARD)
    .then(() => events.push(`move 1 finished`));
  events.push(`trigger move 2`);
  const move2Promise = scanner
    .move(FormMovement.RETRACT_PAPER_BACKWARD)
    .then(() => events.push(`move 2 finished`));

  await Promise.all([move1Promise, move2Promise]);

  expect(events).toEqual([
    `trigger move 1`,
    `trigger move 2`,
    `move request: EJECT_PAPER_FORWARD`,
    `move 1 finished`,
    `move request: RETRACT_PAPER_BACKWARD`,
    `move 2 finished`,
  ]);
});
