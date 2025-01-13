import { expect, test } from 'vitest';
import { err, ok, typedAs } from '@votingworks/basics';
import { CoderError, message, Uint8, uint8 } from '@votingworks/message-coder';
import { Buffer } from 'node:buffer';
import * as fc from 'fast-check';
import {
  arbitraryAckResponseMessage,
  arbitraryErrorCode,
  arbitraryErrorResponseMessage,
  arbitraryFormMovementRequest,
  arbitraryGetImageDataRequest,
  arbitraryHardwareResetRequest,
  arbitraryJobCreateRequest,
  arbitraryJobEndRequest,
  arbitraryJobId,
  arbitraryReleaseType,
  arbitraryRequest,
  arbitraryResponse,
  arbitrarySetScanParametersRequest,
  arbitrarySetScanParametersRequestData,
  arbitraryStartScanRequest,
  arbitraryStatusInternalMessage,
  arbitraryStatusInternalRequest,
  arbitraryStopScanRequest,
} from '../test/arbitraries';
import { makeDuplexChannelListeners } from '../test/helpers';
import { createDuplexChannelMock } from './mocks';
import {
  AckResponseMessage,
  checkAnswer,
  createJob,
  DataResponseMessage,
  endJob,
  ErrorResponseMessage,
  formMove,
  FormMovementRequest,
  getImageData,
  GetImageDataRequest,
  getReleaseVersion,
  getStatusInternal,
  HardwareResetRequest,
  JobCreateRequest,
  JobEndRequest,
  parseRequest,
  parseResponse,
  ReleaseVersionRequest,
  resetHardware,
  sendRequest,
  sendRequestAndReadResponse,
  setScanParameters,
  SetScanParametersRequest,
  SetScanParametersRequestData,
  startScan,
  StartScanRequest,
  StatusInternalMessage,
  StatusInternalRequest,
  stopScan,
  StopScanRequest,
} from './protocol';
import {
  AckResponse,
  CheckAnswerResult,
  ErrorCode,
  ErrorResponse,
  ReleaseType,
  ResponseErrorCode,
  ScanSide,
} from './types';
import { mockCoder } from '../test/mock_coder';

test('ack response', () => {
  fc.assert(
    fc.property(arbitraryJobId(), (jobId) => {
      const buffer = AckResponseMessage.encode({
        jobId,
      }).assertOk('should encode');
      expect(AckResponseMessage.decode(buffer)).toEqual(
        ok(typedAs<AckResponse>({ jobId }))
      );
    })
  );
});

test('error response', () => {
  for (const errorCode of [
    ResponseErrorCode.FORMAT_ERROR,
    ResponseErrorCode.INVALID_COMMAND,
    ResponseErrorCode.INVALID_JOB_ID,
  ]) {
    const buffer = ErrorResponseMessage.encode({
      errorCode,
    }).assertOk(`should encode ${errorCode}`);
    expect(ErrorResponseMessage.decode(buffer)).toEqual(
      ok(typedAs<ErrorResponse>({ errorCode }))
    );
  }
});

test('get image data request', () => {
  fc.assert(
    fc.property(arbitraryGetImageDataRequest(), (getImageDataRequest) => {
      const buffer =
        GetImageDataRequest.encode(getImageDataRequest).assertOk(
          'should encode'
        );
      expect(GetImageDataRequest.decode(buffer)).toEqual(
        ok(getImageDataRequest)
      );
    })
  );

  expect(GetImageDataRequest.default()).toEqual({
    header: ['IMG', 0x00],
    length: 0,
    scanSide: ScanSide.A,
  });

  expect(
    GetImageDataRequest.encode({ length: 1, scanSide: ScanSide.A_AND_B })
  ).toEqual(err(typedAs<CoderError>('InvalidValue')));

  expect(GetImageDataRequest.decode(Buffer.alloc(0))).toEqual(
    err(expect.any(String))
  );
});

test('parseRequest', () => {
  expect(parseRequest(Buffer.alloc(0))).toBeUndefined();

  fc.assert(
    fc.property(arbitraryRequest(), ({ type, coder, value }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encoded = coder.encode(value as any).unsafeUnwrap();
      expect(parseRequest(encoded)).toEqual({ type, coder, value });
    })
  );
});

test('parseResponse', () => {
  expect(parseResponse(Buffer.alloc(0))).toBeUndefined();

  fc.assert(
    fc.property(arbitraryResponse(), ({ type, coder, value }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encoded = coder.encode(value as any).assertOk('encode succeeds');
      expect(parseResponse(encoded)).toEqual({ type, coder, value });
    })
  );
});

test('checkAnswer', () => {
  const ackAnswer = AckResponseMessage.encode({
    jobId: 0x01,
  }).assertOk('should encode');
  expect(checkAnswer(ackAnswer)).toEqual<CheckAnswerResult>({
    type: 'ack',
    jobId: 0x01,
  });

  const formatErrorAnswer = ErrorResponseMessage.encode({
    errorCode: ResponseErrorCode.FORMAT_ERROR,
  }).assertOk('should encode');
  expect(checkAnswer(formatErrorAnswer)).toEqual<CheckAnswerResult>({
    type: 'error',
    errorCode: ErrorCode.CommunicationUnknownError,
  });

  const invalidCommandErrorAnswer = ErrorResponseMessage.encode({
    errorCode: ResponseErrorCode.INVALID_COMMAND,
  }).assertOk('should encode');
  expect(checkAnswer(invalidCommandErrorAnswer)).toEqual<CheckAnswerResult>({
    type: 'error',
    errorCode: ErrorCode.InvalidCommand,
  });

  const jobNotValidErrorAnswer = ErrorResponseMessage.encode({
    errorCode: ResponseErrorCode.INVALID_JOB_ID,
  }).assertOk('should encode');
  expect(checkAnswer(jobNotValidErrorAnswer)).toEqual<CheckAnswerResult>({
    type: 'error',
    errorCode: ErrorCode.JobNotValid,
  });

  const dataAnswer = DataResponseMessage.encode({
    data: 'hello',
  }).assertOk('should encode');
  expect(checkAnswer(dataAnswer)).toEqual<CheckAnswerResult>({
    type: 'data',
    data: 'hello',
  });

  expect(checkAnswer(Buffer.alloc(0))).toEqual<CheckAnswerResult>({
    type: 'other',
    buffer: Buffer.alloc(0),
  });
});

test('sendRequest (experiment)', async () => {
  const { onWrite } = makeDuplexChannelListeners();
  onWrite.mockResolvedValueOnce(ok());

  const channel = createDuplexChannelMock({
    onWrite,
  });

  expect(await channel.connect()).toEqual(ok());

  expect(
    await sendRequest(channel, message({ jobId: uint8() }), { jobId: 0x01 })
  ).toEqual(ok());

  expect(onWrite).toHaveBeenNthCalledWith(1, Buffer.of(0x01));
});

test('write with encoder error', async () => {
  const { onWrite } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({
    onWrite,
  });
  onWrite.mockRejectedValue(new Error('never should be called'));

  expect(await channel.connect()).toEqual(ok());

  const coder = mockCoder<{ jobId: Uint8 }>();

  coder.encode.mockReturnValueOnce(err('InvalidValue'));
  expect(await sendRequest(channel, coder, { jobId: 0xff })).toEqual(
    err(ErrorCode.InvalidParameter)
  );

  coder.encode.mockReturnValueOnce(err('SmallBuffer'));
  expect(await sendRequest(channel, coder, { jobId: 0xff })).toEqual(
    err(ErrorCode.SmallBuffer)
  );

  coder.encode.mockReturnValueOnce(err('TrailingData'));
  expect(await sendRequest(channel, coder, { jobId: 0xff })).toEqual(
    err(ErrorCode.CommunicationUnknownError)
  );

  coder.encode.mockReturnValueOnce(err('UnsupportedOffset'));
  await expect(
    sendRequest(channel, coder, { jobId: 0xff })
  ).rejects.toThrowError();
});

test('request write error', async () => {
  const { onWrite } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({
    onWrite,
  });
  expect(await channel.connect()).toEqual(ok());

  onWrite.mockResolvedValueOnce(err(ErrorCode.InvalidParameter));

  expect(
    await sendRequestAndReadResponse(
      channel,
      message({ jobId: uint8() }),
      { jobId: 0x01 },
      1000,
      'ack'
    )
  ).toEqual(err(ErrorCode.InvalidParameter));
});

test('request error response', async () => {
  const { onRead } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockResolvedValueOnce(err(ErrorCode.InvalidCommand));

  expect(
    await sendRequestAndReadResponse(
      channel,
      message({ jobId: uint8() }),
      { jobId: 0x01 },
      1000,
      'ack'
    )
  ).toEqual(err(ErrorCode.InvalidCommand));
});

test('request read gibberish', async () => {
  const { onRead } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockResolvedValueOnce(ok(Buffer.from('gibberish')));

  expect(
    await sendRequestAndReadResponse(
      channel,
      message({ jobId: uint8() }),
      { jobId: 0x01 },
      1000,
      'ack'
    )
  ).toEqual(err(ErrorCode.DeviceAnswerUnknown));
});

test('request encode error', async () => {
  const channel = createDuplexChannelMock(makeDuplexChannelListeners());
  expect(await channel.connect()).toEqual(ok());

  expect(
    await sendRequestAndReadResponse(
      channel,
      message({ jobId: uint8() }),
      { jobId: 0xffff },
      1000,
      'ack'
    )
  ).toEqual(err(ErrorCode.InvalidParameter));
});

test('getReleaseVersion', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryReleaseType(),
      fc.string(),
      async (releaseType, version) => {
        const { onWrite, onRead } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onWrite, onRead });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(
            DataResponseMessage.encode({
              data: version,
            }).assertOk('should encode')
          )
        );

        expect(await getReleaseVersion(channel, releaseType)).toEqual(
          ok(version)
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          ReleaseVersionRequest.encode({
            releaseType,
          }).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('getReleaseVersion with error', async () => {
  const { onRead } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockResolvedValueOnce(err(ErrorCode.DeviceAnswerUnknown));

  expect(await getReleaseVersion(channel, ReleaseType.Firmware)).toEqual(
    err(ErrorCode.DeviceAnswerUnknown)
  );
});

test('getStatusInternal', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryStatusInternalRequest(),
      arbitraryStatusInternalMessage(),
      async (req, res) => {
        const { onWrite, onRead } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onWrite, onRead });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(StatusInternalMessage.encode(res).assertOk('should encode'))
        );

        expect(await getStatusInternal(channel, req.jobId)).toEqual(ok(res));

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          StatusInternalRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('createJob', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryJobCreateRequest(),
      arbitraryAckResponseMessage(),
      async (req, res) => {
        const { onWrite, onRead } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onWrite, onRead });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await createJob(channel)).toEqual(ok(res.jobId));

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          JobCreateRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('endJob', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryJobEndRequest(),
      arbitraryAckResponseMessage(),
      async (req, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await endJob(channel, req.jobId)).toEqual(ok());

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          JobEndRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('formMove', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryFormMovementRequest(),
      arbitraryAckResponseMessage(),
      async (req, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await formMove(channel, req.jobId, req.movement)).toEqual(ok());

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          FormMovementRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('setScanParameters', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitrarySetScanParametersRequest(),
      arbitrarySetScanParametersRequestData(),
      arbitraryAckResponseMessage(),
      async (req, parameters, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await setScanParameters(channel, req.jobId, parameters)).toEqual(
          ok()
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          SetScanParametersRequest.encode(req).assertOk('should encode')
        );
        expect(onWrite).toHaveBeenNthCalledWith(
          2,
          SetScanParametersRequestData.encode(parameters).assertOk(
            'should encode'
          )
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('setScanParameters with error res', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitrarySetScanParametersRequest(),
      arbitrarySetScanParametersRequestData(),
      arbitraryErrorResponseMessage(),
      async (req, parameters, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(ErrorResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await setScanParameters(channel, req.jobId, parameters)).toEqual(
          err(expect.anything())
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          SetScanParametersRequest.encode(req).assertOk('should encode')
        );
        expect(onWrite).toHaveBeenNthCalledWith(
          2,
          SetScanParametersRequestData.encode(parameters).assertOk(
            'should encode'
          )
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('setScanParameters with write error (1/2)', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitrarySetScanParametersRequest(),
      arbitrarySetScanParametersRequestData(),
      arbitraryErrorCode(),
      async (req, parameters, errorCode) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onWrite.mockResolvedValueOnce(err(errorCode));

        expect(await setScanParameters(channel, req.jobId, parameters)).toEqual(
          err(errorCode)
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          SetScanParametersRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(0);
      }
    )
  );
});

test('setScanParameters with write error (2/2)', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitrarySetScanParametersRequest(),
      arbitrarySetScanParametersRequestData(),
      arbitraryErrorCode(),
      async (req, parameters, errorCode) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onWrite
          .mockResolvedValueOnce(ok())
          .mockResolvedValueOnce(err(errorCode));

        expect(await setScanParameters(channel, req.jobId, parameters)).toEqual(
          err(errorCode)
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          SetScanParametersRequest.encode(req).assertOk('should encode')
        );
        expect(onWrite).toHaveBeenNthCalledWith(
          2,
          SetScanParametersRequestData.encode(parameters).assertOk(
            'should encode'
          )
        );
        expect(onRead).toHaveBeenCalledTimes(0);
      }
    )
  );
});

test('setScanParameters read error', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitrarySetScanParametersRequest(),
      arbitrarySetScanParametersRequestData(),
      arbitraryErrorCode(),
      async (req, parameters, errorCode) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(err(errorCode));

        expect(await setScanParameters(channel, req.jobId, parameters)).toEqual(
          err(errorCode)
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          SetScanParametersRequest.encode(req).assertOk('should encode')
        );
        expect(onWrite).toHaveBeenNthCalledWith(
          2,
          SetScanParametersRequestData.encode(parameters).assertOk(
            'should encode'
          )
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('setScanParameters read gibberish', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitrarySetScanParametersRequest(),
      arbitrarySetScanParametersRequestData(),
      fc.uint8Array(),
      async (req, parameters, gibberish) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(ok(Buffer.from(gibberish)));

        expect(await setScanParameters(channel, req.jobId, parameters)).toEqual(
          err(ErrorCode.DeviceAnswerUnknown)
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          SetScanParametersRequest.encode(req).assertOk('should encode')
        );
        expect(onWrite).toHaveBeenNthCalledWith(
          2,
          SetScanParametersRequestData.encode(parameters).assertOk(
            'should encode'
          )
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('startScan', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryStartScanRequest(),
      arbitraryAckResponseMessage(),
      async (req, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await startScan(channel, req.jobId)).toEqual(ok());

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          StartScanRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('stopScan', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryStopScanRequest(),
      arbitraryAckResponseMessage(),
      async (req, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await stopScan(channel, req.jobId)).toEqual(ok());

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          StopScanRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('resetHardware', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryHardwareResetRequest(),
      arbitraryAckResponseMessage(),
      async (req, res) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        onRead.mockResolvedValueOnce(
          ok(AckResponseMessage.encode(res).assertOk('should encode'))
        );

        expect(await resetHardware(channel, req.jobId)).toEqual(ok());

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          HardwareResetRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    )
  );
});

test('resetHardware ignores clearHalt errors', async () => {
  const { onRead, onWrite } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead, onWrite });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockRejectedValueOnce(new Error('clearHalt error'));
  expect(await resetHardware(channel, 0x01)).toEqual(ok());
});

test('resetHardware does not ignore other errors', async () => {
  const { onRead, onWrite } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead, onWrite });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockRejectedValueOnce(new Error('EOHNOES'));
  await expect(resetHardware(channel, 0x01)).rejects.toThrowError('EOHNOES');
});

test('getImageData', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryGetImageDataRequest()
        // keep memory usage low
        .filter((req) => req.length < 0xff)
        .chain((req) =>
          fc.record({
            req: fc.constant(req),
            data: fc.uint8Array({
              minLength: req.length,
              maxLength: req.length,
            }),
          })
        ),
      async ({ req, data }) => {
        const { onRead, onWrite } = makeDuplexChannelListeners();
        const channel = createDuplexChannelMock({ onRead, onWrite });
        expect(await channel.connect()).toEqual(ok());

        const res = Buffer.from(data);

        onRead.mockResolvedValueOnce(ok(res));

        expect(GetImageDataRequest.canEncode(req)).toEqual(true);
        expect(await getImageData(channel, req.length, req.scanSide)).toEqual(
          ok(res)
        );

        expect(onWrite).toHaveBeenNthCalledWith(
          1,
          GetImageDataRequest.encode(req).assertOk('should encode')
        );
        expect(onRead).toHaveBeenCalledTimes(1);
      }
    ),
    {
      seed: 0, // with a random seed, some branches are sporadically missed
    }
  );
});

test('getImageData reads multiple chunks', async () => {
  const { onRead, onWrite } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({
    onRead,
    onWrite,
  });
  expect(await channel.connect()).toEqual(ok());

  const req = GetImageDataRequest.encode({
    length: 16,
    scanSide: ScanSide.A,
  }).assertOk('should encode');

  const res = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
  const chunks = [res.subarray(0, 5), res.subarray(5, 10), res.subarray(10)];

  for (const chunk of chunks) {
    onRead.mockReturnValueOnce(ok(chunk));
  }

  expect(await getImageData(channel, 16, ScanSide.A)).toEqual(ok(res));
  expect(onWrite).toHaveBeenNthCalledWith(1, req);
});

test('getImageData write error', async () => {
  const channel = createDuplexChannelMock({
    onWrite: () => err(ErrorCode.SmallBuffer),
  });
  expect(await channel.connect()).toEqual(ok());

  expect(await getImageData(channel, 16, ScanSide.A)).toEqual(
    err(ErrorCode.SmallBuffer)
  );
});

test('getImageData read error', async () => {
  const { onRead } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockReturnValueOnce(err(ErrorCode.SmallBuffer));

  expect(await getImageData(channel, 16, ScanSide.A)).toEqual(
    err(ErrorCode.SmallBuffer)
  );
});

test('getImageData error response', async () => {
  const { onRead } = makeDuplexChannelListeners();
  const channel = createDuplexChannelMock({ onRead });
  expect(await channel.connect()).toEqual(ok());

  onRead.mockResolvedValueOnce(
    ok(
      ErrorResponseMessage.encode({
        errorCode: ResponseErrorCode.INVALID_COMMAND,
      }).assertOk('should encode')
    )
  );

  expect(await getImageData(channel, 16, ScanSide.A)).toEqual(
    err(ErrorCode.ScannerError)
  );
});
