import { err, ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { makeProtocolListeners } from '../../test/helpers';
import {
  ErrorResponseMessage,
  ReleaseVersionRequest,
  REQUEST_CODERS,
} from '../protocol';
import { ErrorCode, ResponseErrorCode } from '../types';
import { ProtocolListeners, usbChannelWithMockProtocol } from './protocol';

test('usbChannelWithMockProtocol calls onUnhandledRequest for anything not specifically handled', async () => {
  const { onReleaseVersionRequest, onUnhandledRequest } =
    makeProtocolListeners();
  const usbChannel = usbChannelWithMockProtocol({
    onReleaseVersionRequest,
    onUnhandledRequest,
  });

  expect(await usbChannel.connect()).toEqual(ok());

  for (const coder of Object.values(REQUEST_CODERS)) {
    expect(
      await usbChannel.write(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no good way to type this because of the intersection type
        coder.encode(coder.default() as any).assertOk('encode failed')
      )
    ).toEqual(ok());
  }

  expect(onReleaseVersionRequest).toHaveBeenCalledTimes(1);
  expect(onUnhandledRequest).toHaveBeenCalledTimes(
    Object.values(REQUEST_CODERS).length - 1
  );
});

test('usbChannelWithMockProtocol throws on unhandled requests', async () => {
  const usbChannel = usbChannelWithMockProtocol({});
  expect(await usbChannel.connect()).toEqual(ok());
  await expect(
    usbChannel.write(
      ReleaseVersionRequest.encode(ReleaseVersionRequest.default()).assertOk(
        'encode failed'
      )
    )
  ).rejects.toThrowError('Unhandled ReleaseVersionRequest');
});

test('usbChannelWithMockProtocol throws on gibberish requests', async () => {
  const usbChannel = usbChannelWithMockProtocol({});
  expect(await usbChannel.connect()).toEqual(ok());
  await expect(usbChannel.write(Buffer.from('gibberish'))).rejects.toThrowError(
    /unknown request.*gibberish/
  );
});

test('usbChannelWithMockProtocol with all handlers', async () => {
  const listeners = {
    onFormMovementRequest: jest.fn(),
    onReleaseVersionRequest: jest.fn(),
    onGetImageDataRequest: jest.fn(),
    onHardwareResetRequest: jest.fn(),
    onJobCreateRequest: jest.fn(),
    onJobEndRequest: jest.fn(),
    onMapParametersRequest: jest.fn(),
    onMapParametersRequestData: jest.fn(),
    onSetScanParametersRequest: jest.fn(),
    onSetScanParametersRequestData: jest.fn(),
    onStartScanRequest: jest.fn(),
    onStatusInternalRequest: jest.fn(),
    onStopScanRequest: jest.fn(),
  } as const;

  // check that we didn't miss any
  typedAs<Omit<ProtocolListeners, 'onUnhandledRequest'>>(listeners);

  const usbChannel = usbChannelWithMockProtocol(listeners);
  expect(await usbChannel.connect()).toEqual(ok());

  // check that errors propagate
  for (const listener of Object.values(listeners)) {
    listener.mockResolvedValueOnce(err(ResponseErrorCode.INVALID_COMMAND));
  }

  for (const coder of Object.values(REQUEST_CODERS)) {
    expect(
      await usbChannel.write(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no good way to type this because of the intersection type
        coder.encode(coder.default() as any).assertOk('encode failed')
      )
    ).toEqual(ok());

    expect(await usbChannel.read(100)).toEqual(
      ok(
        ErrorResponseMessage.encode({
          errorCode: ResponseErrorCode.INVALID_COMMAND,
        }).assertOk('encode failed')
      )
    );
  }

  // don't respond to any requests (this is primarily for coverage)
  for (const coder of Object.values(REQUEST_CODERS)) {
    expect(
      await usbChannel.write(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no good way to type this because of the intersection type
        coder.encode(coder.default() as any).assertOk('encode failed')
      )
    ).toEqual(ok());
  }

  // check that the listeners were called
  for (const listener of Object.values(listeners)) {
    expect(listener).toHaveBeenCalledTimes(2);
  }
});

test('usbChannelWithMockProtocol buffers read data', async () => {
  const usbChannel = usbChannelWithMockProtocol({
    onReleaseVersionRequest() {
      return ok({ data: 'abcdefgh' });
    },
  });
  expect(await usbChannel.connect()).toEqual(ok());

  expect(
    await usbChannel.write(
      ReleaseVersionRequest.encode(ReleaseVersionRequest.default()).assertOk(
        'encode failed'
      )
    )
  ).toEqual(ok());
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('C')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('D')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('A')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('T')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('a')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('b')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('c')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('d')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('e')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('f')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('g')));
  expect(await usbChannel.read(1)).toEqual(ok(Buffer.from('h')));
  expect(await usbChannel.read(1)).toEqual(err(ErrorCode.NoDeviceAnswer));
});
