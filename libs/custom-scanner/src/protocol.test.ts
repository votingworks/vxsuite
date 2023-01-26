import { typedAs } from '@votingworks/basics';
import { ErrorResponseMessage, AckResponseMessage } from './protocol';
import { ErrorResponse, ResponseErrorCode } from './types';

test('ack response', () => {
  const buffer = AckResponseMessage.encode({
    jobId: 0x12,
  }).assertOk('should encode');
  expect(AckResponseMessage.decode(buffer).assertOk('should decode')).toEqual({
    jobId: 0x12,
  });
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
    expect(
      ErrorResponseMessage.decode(buffer).assertOk(`should decode ${errorCode}`)
    ).toEqual(
      typedAs<ErrorResponse>({
        errorCode,
      })
    );
  }
});
