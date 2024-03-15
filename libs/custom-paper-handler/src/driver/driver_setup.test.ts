import { Device, findByIds, WebUSBDevice } from 'usb';
import { assert } from '@votingworks/basics';
import { expect, mock, spyOn, test } from 'bun:test';
import { getPaperHandlerWebDevice, PaperHandlerDriver } from './driver';
import { setUpMockWebUsbDevice } from './test_utils';

void mock.module('usb', () => ({
  findByIds: mock(),
  // eslint-disable-next-line vx/gts-identifiers
  WebUSBDevice: {
    createInstance: mock(),
  },
}));

const findByIdsMock = findByIds as jest.MockedFunction<typeof findByIds>;
const createInstanceMock = WebUSBDevice.createInstance as jest.MockedFunction<
  typeof WebUSBDevice.createInstance
>;

test('getPaperHandlerWebDevice calls createInstanceMock when successful', async () => {
  const { legacyDevice } = setUpMockWebUsbDevice(
    findByIdsMock,
    createInstanceMock
  );
  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  assert(paperHandlerWebDevice);
  expect(createInstanceMock).toHaveBeenCalledWith(legacyDevice);
});

test('getPaperHandlerWebDevice returns undefined when findByIds returns no devices', async () => {
  findByIdsMock.mockReturnValueOnce(undefined);

  const device = await getPaperHandlerWebDevice();
  expect(device).toBeUndefined();
  expect(createInstanceMock).not.toHaveBeenCalled();
});

test('getPaperHandlerWebDevice errors when createInstance returns an error', () => {
  const legacyDevice = {} as unknown as Device;
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockRejectedValueOnce(new Error('test'));

  expect(getPaperHandlerWebDevice()).rejects.toThrow(
    'Error initializing WebUSBDevice with message: test'
  );
  expect(createInstanceMock).toHaveBeenCalled();
});

test('connect calls WebUSBDevice.open', async () => {
  setUpMockWebUsbDevice(findByIdsMock, createInstanceMock);
  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  assert(paperHandlerWebDevice);
  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);

  const openSpy = spyOn(paperHandlerWebDevice, 'open');

  await paperHandlerDriver.connect();

  expect(openSpy).toHaveBeenCalledTimes(1);
});
