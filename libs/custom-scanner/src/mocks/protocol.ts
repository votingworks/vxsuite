import { err, ok, Optional, Result } from '@votingworks/basics';
import { Coder } from '@votingworks/message-coder';
import { Buffer } from 'buffer';
import { inspect } from 'util';
import { debug } from '../debug';
import {
  AckResponseMessage,
  AnyRequest,
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
} from '../protocol';
import {
  DuplexChannel,
  ErrorCode,
  MaybePromise,
  ResponseErrorCode,
} from '../types';
import { createDuplexChannelMock } from './usb_channel';

/**
 * Listeners for the Custom A4 scanner protocol commands.
 */
export interface ProtocolListeners {
  onReleaseVersionRequest(
    releaseVersionRequest: ReleaseVersionRequest
  ): MaybePromise<Optional<Result<DataResponseMessage, ResponseErrorCode>>>;
  onStatusInternalRequest(
    statusInternalRequest: StatusInternalRequest
  ): MaybePromise<Optional<Result<StatusInternalMessage, ResponseErrorCode>>>;
  onSetScanParametersRequest(
    setScanParametersRequest: SetScanParametersRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onSetScanParametersRequestData(
    setScanParametersRequestData: SetScanParametersRequestData
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onJobCreateRequest(
    jobCreateRequest: JobCreateRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onJobEndRequest(
    jobEndRequest: JobEndRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onStartScanRequest(
    startScanRequest: StartScanRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onGetImageDataRequest(
    getImageDataRequest: GetImageDataRequest
  ): MaybePromise<Optional<Result<Buffer, ResponseErrorCode>>>;
  onStopScanRequest(
    stopScanRequest: StopScanRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onFormMovementRequest(
    formMoveRequest: FormMovementRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onHardwareResetRequest(
    hardwareResetRequest: HardwareResetRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onMapParametersRequest(
    mapParametersRequest: MapParametersRequest
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onMapParametersRequestData(
    mapParametersRequestData: MapParametersRequestData
  ): MaybePromise<Optional<Result<AckResponseMessage, ResponseErrorCode>>>;
  onUnhandledRequest(
    request: AnyRequest
  ): MaybePromise<Optional<Result<Buffer, ResponseErrorCode>>>;
}

/**
 * Creates a mock USB channel that interprets the Custom A4 scanner protocol,
 * passing the commands to the provided listeners. Listeners respond by
 * returning a `Result` of the expected response type or an error code, or they
 * may choose to provide no response at all, in which case no data will be
 * available to read from the channel.
 *
 * There are no default listeners, so if you don't provide a listener for a
 * command, the mock channel will throw an error when that command is received.
 * To provide a default listener, provide a listener for `onUnhandledRequest`.
 */
export function usbChannelWithMockProtocol({
  onUnhandledRequest,
  onReleaseVersionRequest,
  onStatusInternalRequest,
  onSetScanParametersRequest,
  onSetScanParametersRequestData,
  onJobCreateRequest,
  onJobEndRequest,
  onStartScanRequest,
  onGetImageDataRequest,
  onStopScanRequest,
  onFormMovementRequest,
  onHardwareResetRequest,
  onMapParametersRequest,
  onMapParametersRequestData,
}: Partial<ProtocolListeners>): DuplexChannel {
  let readBuffer: Buffer | undefined;

  function setNextReadBuffer(buffer: Buffer | Result<Buffer, unknown>): void {
    const newBuffer = Buffer.isBuffer(buffer) ? buffer : buffer.unsafeUnwrap();

    /* istanbul ignore next */
    if (readBuffer) {
      throw new Error(
        `read buffer already set: ${inspect(
          readBuffer.toString()
        )}, cannot use new buffer: ${inspect(newBuffer.toString())}`
      );
    }

    readBuffer = Buffer.isBuffer(buffer) ? buffer : buffer.unsafeUnwrap();
  }

  function handleMockResponderReturnValue<T>(
    result: Optional<Result<T, ResponseErrorCode>>,
    coder: Coder<T>
  ): void {
    if (result?.isOk()) {
      setNextReadBuffer(coder.encode(result.ok()));
    } else if (result?.isErr()) {
      setNextReadBuffer(
        ErrorResponseMessage.encode({ errorCode: result.err() })
      );
    }
  }

  async function handleUnhandledRequest(request: AnyRequest): Promise<void> {
    debug('unhandled %s: %o', request.type, request.value);
    if (!onUnhandledRequest) {
      throw new Error(`Unhandled ${request.type}: ${inspect(request.value)}`);
    }

    const result = await onUnhandledRequest(request);
    if (result?.isOk()) {
      setNextReadBuffer(result.ok());
    } else if (result?.isErr()) {
      setNextReadBuffer(
        ErrorResponseMessage.encode({ errorCode: result.err() })
      );
    }
  }

  const mockUsbChannel = createDuplexChannelMock({
    onRead: (maxLength) => {
      if (!readBuffer) {
        return err(ErrorCode.NoDeviceAnswer);
      }

      if (readBuffer.byteLength > maxLength) {
        const result = readBuffer.subarray(0, maxLength);
        readBuffer = readBuffer.subarray(maxLength);
        return ok(result);
      }

      const buffer = readBuffer;
      readBuffer = undefined;
      return ok(buffer);
    },

    onWrite: async (data) => {
      const releaseVersionRequest = ReleaseVersionRequest.decode(data);
      if (releaseVersionRequest.isOk()) {
        if (onReleaseVersionRequest) {
          handleMockResponderReturnValue(
            await onReleaseVersionRequest(releaseVersionRequest.ok()),
            DataResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'ReleaseVersionRequest',
            value: releaseVersionRequest.ok(),
            coder: ReleaseVersionRequest,
          });
        }
        return ok();
      }

      const statusInternalRequest = StatusInternalRequest.decode(data);
      if (statusInternalRequest.isOk()) {
        if (onStatusInternalRequest) {
          handleMockResponderReturnValue(
            await onStatusInternalRequest(statusInternalRequest.ok()),
            StatusInternalMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'StatusInternalRequest',
            value: statusInternalRequest.ok(),
            coder: StatusInternalRequest,
          });
        }
        return ok();
      }

      const setScanParametersRequest = SetScanParametersRequest.decode(data);
      if (setScanParametersRequest.isOk()) {
        if (onSetScanParametersRequest) {
          handleMockResponderReturnValue(
            await onSetScanParametersRequest(setScanParametersRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'SetScanParametersRequest',
            value: setScanParametersRequest.ok(),
            coder: SetScanParametersRequest,
          });
        }
        return ok();
      }

      const setScanParametersRequestData =
        SetScanParametersRequestData.decode(data);
      if (setScanParametersRequestData.isOk()) {
        if (onSetScanParametersRequestData) {
          handleMockResponderReturnValue(
            await onSetScanParametersRequestData(
              setScanParametersRequestData.ok()
            ),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'SetScanParametersRequestData',
            value: setScanParametersRequestData.ok(),
            coder: SetScanParametersRequestData,
          });
        }
        return ok();
      }

      const jobCreateRequest = JobCreateRequest.decode(data);
      if (jobCreateRequest.isOk()) {
        if (onJobCreateRequest) {
          handleMockResponderReturnValue(
            await onJobCreateRequest(jobCreateRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'JobCreateRequest',
            value: jobCreateRequest.ok(),
            coder: JobCreateRequest,
          });
        }
        return ok();
      }

      const jobEndRequest = JobEndRequest.decode(data);
      if (jobEndRequest.isOk()) {
        if (onJobEndRequest) {
          handleMockResponderReturnValue(
            await onJobEndRequest(jobEndRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'JobEndRequest',
            value: jobEndRequest.ok(),
            coder: JobEndRequest,
          });
        }
        return ok();
      }

      const startScanRequest = StartScanRequest.decode(data);
      if (startScanRequest.isOk()) {
        if (onStartScanRequest) {
          handleMockResponderReturnValue(
            await onStartScanRequest(startScanRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'StartScanRequest',
            value: startScanRequest.ok(),
            coder: StartScanRequest,
          });
        }
        return ok();
      }

      const getImageDataRequest = GetImageDataRequest.decode(data);
      if (getImageDataRequest.isOk()) {
        if (onGetImageDataRequest) {
          const response = await onGetImageDataRequest(
            getImageDataRequest.ok()
          );

          if (response?.isOk()) {
            setNextReadBuffer(response.ok());
          } else if (response?.isErr()) {
            setNextReadBuffer(
              ErrorResponseMessage.encode({
                errorCode: response.err(),
              }).assertOk('encode failed')
            );
          }
        } else {
          await handleUnhandledRequest({
            type: 'GetImageDataRequest',
            value: getImageDataRequest.ok(),
            coder: GetImageDataRequest,
          });
        }
        return ok();
      }

      const stopScanRequest = StopScanRequest.decode(data);
      if (stopScanRequest.isOk()) {
        if (onStopScanRequest) {
          handleMockResponderReturnValue(
            await onStopScanRequest(stopScanRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'StopScanRequest',
            value: stopScanRequest.ok(),
            coder: StopScanRequest,
          });
        }
        return ok();
      }

      const formMovementRequest = FormMovementRequest.decode(data);
      if (formMovementRequest.isOk()) {
        if (onFormMovementRequest) {
          handleMockResponderReturnValue(
            await onFormMovementRequest(formMovementRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'FormMovementRequest',
            value: formMovementRequest.ok(),
            coder: FormMovementRequest,
          });
        }
        return ok();
      }

      const hardwareResetRequest = HardwareResetRequest.decode(data);
      if (hardwareResetRequest.isOk()) {
        if (onHardwareResetRequest) {
          handleMockResponderReturnValue(
            await onHardwareResetRequest(hardwareResetRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'HardwareResetRequest',
            value: hardwareResetRequest.ok(),
            coder: HardwareResetRequest,
          });
        }
        return ok();
      }

      const mapParametersRequest = MapParametersRequest.decode(data);
      if (mapParametersRequest.isOk()) {
        if (onMapParametersRequest) {
          handleMockResponderReturnValue(
            await onMapParametersRequest(mapParametersRequest.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'MapParametersRequest',
            value: mapParametersRequest.ok(),
            coder: MapParametersRequest,
          });
        }
        return ok();
      }

      const mapParametersRequestData = MapParametersRequestData.decode(data);
      if (mapParametersRequestData.isOk()) {
        if (onMapParametersRequestData) {
          handleMockResponderReturnValue(
            await onMapParametersRequestData(mapParametersRequestData.ok()),
            AckResponseMessage
          );
        } else {
          await handleUnhandledRequest({
            type: 'MapParametersRequestData',
            value: mapParametersRequestData.ok(),
            coder: MapParametersRequestData,
          });
        }
        return ok();
      }

      debug('unknown request: %o', data);
      throw new Error(
        `unknown request: ${inspect(data)} (${inspect(data.toString())})`
      );
    },
  });

  return mockUsbChannel;
}
