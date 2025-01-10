import { expect, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import fc from 'fast-check';
import { arbitraryStatusInternalMessage } from '../../test/arbitraries';
import { CustomA4Scanner } from '../custom_a4_scanner';
import { createDuplexChannelMock } from '../mocks';
import { ErrorResponseMessage, StatusInternalMessage } from '../protocol';
import { convertFromInternalStatus } from '../status';
import { ErrorCode, ResponseErrorCode } from '../types';
import { StatusWatcher, watchStatus } from './status_watcher';

test('watchStatus yields initial status', async () => {
  const onRead = vi.fn();
  const usbChannelMock = createDuplexChannelMock({
    onRead,
  });
  const scanner = new CustomA4Scanner(usbChannelMock);

  (await scanner.connect()).assertOk('connect failed');
  const internalStatus = fc.sample(arbitraryStatusInternalMessage(), 1)[0]!;
  onRead.mockResolvedValueOnce(
    ok(StatusInternalMessage.encode(internalStatus).assertOk('encode failed'))
  );
  const watcher = watchStatus(scanner, { interval: 1 });
  try {
    const status = await watcher.next();
    expect(status).toEqual({
      done: false,
      value: ok(convertFromInternalStatus(internalStatus).status),
    });
  } finally {
    watcher.stop();
  }
});

test('watchStatus in for-await-of loop yields initial status', async () => {
  const onRead = vi.fn();
  const usbChannelMock = createDuplexChannelMock({ onRead });
  const scanner = new CustomA4Scanner(usbChannelMock);

  (await scanner.connect()).assertOk('connect failed');
  const internalStatus = fc.sample(arbitraryStatusInternalMessage(), 1)[0]!;
  onRead.mockResolvedValueOnce(
    ok(StatusInternalMessage.encode(internalStatus).assertOk('encode failed'))
  );

  const watcher = watchStatus(scanner, { interval: 1 });
  for await (const status of watcher) {
    try {
      expect(status).toEqual(
        ok(convertFromInternalStatus(internalStatus).status)
      );
    } finally {
      watcher.stop();
    }
  }
});

test('watchStatus sleeps 250ms between status checks by default', async () => {
  const writeTimestamps: number[] = [];
  const internalStatus = fc.sample(arbitraryStatusInternalMessage(), 1)[0]!;
  const onRead = vi.fn();
  let watcher!: StatusWatcher;
  const usbChannelMock = createDuplexChannelMock({
    onRead,

    onWrite: () => {
      writeTimestamps.push(Date.now());

      onRead.mockResolvedValueOnce(
        ok(
          StatusInternalMessage.encode(internalStatus).assertOk('encode failed')
        )
      );

      if (writeTimestamps.length === 3) {
        watcher.stop();
      }

      return ok();
    },
  });

  const scanner = new CustomA4Scanner(usbChannelMock);

  (await scanner.connect()).assertOk('connect failed');
  watcher = watchStatus(scanner);
  try {
    await watcher.next();
    await watcher.next();
    expect(writeTimestamps).toHaveLength(3);
    const [, secondWriteTimestamp, thirdWriteTimestamp] = writeTimestamps as [
      number,
      number,
      number,
    ];
    expect(thirdWriteTimestamp - secondWriteTimestamp).toBeGreaterThanOrEqual(
      250
    );
  } finally {
    watcher.stop();
  }
});

test('watchStatus yields status updates', async () => {
  const onRead = vi.fn();
  const usbChannelMock = createDuplexChannelMock({
    onRead,
  });
  const scanner = new CustomA4Scanner(usbChannelMock);

  (await scanner.connect()).assertOk('connect failed');

  const initialStatus = fc.sample(arbitraryStatusInternalMessage(), 1)[0]!;

  // cheat and use the reserved space to ensure we get a different status
  initialStatus.reserve1 = 0x01;
  const nextStatus: StatusInternalMessage = {
    ...initialStatus,
    // change something so we can tell it's a different status
    reserve1: initialStatus.reserve1 + 1,
  };

  const encodedInitialStatus =
    StatusInternalMessage.encode(initialStatus).assertOk('encode failed');
  const encodedNextStatus =
    StatusInternalMessage.encode(nextStatus).assertOk('encode failed');

  // send the same multiple times but only expect one update since the status
  // hasn't changed
  onRead
    .mockResolvedValueOnce(ok(encodedInitialStatus))
    .mockResolvedValueOnce(ok(encodedInitialStatus))
    .mockResolvedValueOnce(ok(encodedInitialStatus))
    .mockResolvedValueOnce(ok(encodedInitialStatus))
    .mockResolvedValueOnce(ok(encodedInitialStatus))
    .mockResolvedValueOnce(ok(encodedNextStatus));

  const watcher = watchStatus(scanner, { interval: 1 });

  try {
    const status = await watcher.next();

    expect(status).toEqual({
      done: false,
      value: ok(convertFromInternalStatus(initialStatus).status),
    });

    const status2 = await watcher.next();
    expect(status2).toEqual({
      done: false,
      value: ok(convertFromInternalStatus(nextStatus).status),
    });
  } finally {
    watcher.stop();
  }
});

test('watchStatus yields errors', async () => {
  const onRead = vi.fn();
  const usbChannelMock = createDuplexChannelMock({ onRead });
  const scanner = new CustomA4Scanner(usbChannelMock);

  (await scanner.connect()).assertOk('connect failed');

  const encodedInitialError = ErrorResponseMessage.encode({
    errorCode: ResponseErrorCode.INVALID_JOB_ID,
  }).assertOk('encode failed');
  const encodedNextError = ErrorResponseMessage.encode({
    errorCode: ResponseErrorCode.INVALID_COMMAND,
  }).assertOk('encode failed');

  // send the same multiple times but only expect one update since the error
  // hasn't changed
  onRead
    .mockResolvedValueOnce(ok(encodedInitialError))
    .mockResolvedValueOnce(ok(encodedInitialError))
    .mockResolvedValueOnce(ok(encodedInitialError))
    .mockResolvedValueOnce(ok(encodedInitialError))
    .mockResolvedValueOnce(ok(encodedInitialError))
    .mockResolvedValueOnce(ok(encodedNextError));

  const watcher = watchStatus(scanner, { interval: 1 });

  try {
    const status = await watcher.next();

    expect(status).toEqual({
      done: false,
      value: err(ErrorCode.JobNotValid),
    });

    const status2 = await watcher.next();
    expect(status2).toEqual({
      done: false,
      value: err(ErrorCode.InvalidCommand),
    });
  } finally {
    watcher.stop();
  }
});

test('watchStatus is done after calling `stop`', async () => {
  const onRead = vi.fn();
  const usbChannelMock = createDuplexChannelMock({ onRead });
  const scanner = new CustomA4Scanner(usbChannelMock);

  (await scanner.connect()).assertOk('connect failed');
  const internalStatus = fc.sample(arbitraryStatusInternalMessage(), 1)[0]!;
  onRead.mockResolvedValueOnce(
    ok(StatusInternalMessage.encode(internalStatus).assertOk('encode failed'))
  );
  const watcher = watchStatus(scanner, { interval: 1 });
  watcher.stop();
  expect(await watcher.next()).toEqual({ done: true, value: undefined });
});
