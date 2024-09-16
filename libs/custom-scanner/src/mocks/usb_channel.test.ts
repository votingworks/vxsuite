import { Buffer } from 'node:buffer';
import { err, ok } from '@votingworks/basics';
import { ErrorCode } from '../types';
import { createDuplexChannelMock } from './usb_channel';

test('connect/disconnect', async () => {
  const channel = createDuplexChannelMock({});

  // running connect/disconnect multiple times should be fine
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.disconnect()).toBeUndefined();
  expect(await channel.disconnect()).toBeUndefined();
});

test('connect/disconnect with listeners', async () => {
  const onConnect = jest.fn().mockReturnValueOnce(ok());
  const onDisconnect = jest.fn();

  const channel = createDuplexChannelMock({
    onConnect,
    onDisconnect,
  });

  // call each twice
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.disconnect()).toBeUndefined();
  expect(await channel.disconnect()).toBeUndefined();

  // listeners should have been called once
  expect(onConnect).toHaveBeenCalledTimes(1);
  expect(onDisconnect).toHaveBeenCalledTimes(1);
});

test('read when not connected', async () => {
  const channel = createDuplexChannelMock({});
  expect(await channel.read(1)).toEqual(err(ErrorCode.ScannerOffline));
});

test('write when not connected', async () => {
  const channel = createDuplexChannelMock({});
  expect(await channel.write(Buffer.alloc(0))).toEqual(
    err(ErrorCode.ScannerOffline)
  );
});

test('read with no listener', async () => {
  const channel = createDuplexChannelMock({});
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.read(1)).toEqual(err(ErrorCode.NoDeviceAnswer));
});

test('write with no listener', async () => {
  const channel = createDuplexChannelMock({});
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.write(Buffer.alloc(0))).toEqual(ok());
});

test('read with listener', async () => {
  const channel = createDuplexChannelMock({
    onRead: (maxLength) => {
      expect(maxLength).toEqual(1);
      return ok(Buffer.from([1]));
    },
  });

  expect(await channel.connect()).toEqual(ok());
  expect(await channel.read(1)).toEqual(ok(Buffer.from([1])));
});

test('write with listener', async () => {
  const channel = createDuplexChannelMock({
    onWrite: (data) => {
      expect(data).toEqual(Buffer.from([1, 2, 3]));
      return ok();
    },
  });

  expect(await channel.connect()).toEqual(ok());
  expect(await channel.write(Buffer.from([1, 2, 3]))).toEqual(ok());
});
