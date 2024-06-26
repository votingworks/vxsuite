import { Device, findByIds, WebUSBDevice } from 'usb';
import { assert } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { getPaperHandlerWebDevice, PaperHandlerDriver } from './driver';
import { setUpMockWebUsbDevice } from './test_utils';
import { MaxPrintWidthDots } from './constants';

jest.mock('usb');
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

test('getPaperHandlerWebDevice errors when createInstance returns an error', async () => {
  const legacyDevice = {} as unknown as Device;
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockRejectedValueOnce(new Error('test'));

  await expect(getPaperHandlerWebDevice()).rejects.toThrow(
    'Error initializing WebUSBDevice with message: test'
  );
  expect(createInstanceMock).toHaveBeenCalled();
});

test('connect calls WebUSBDevice.open', async () => {
  setUpMockWebUsbDevice(findByIdsMock, createInstanceMock);
  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  assert(paperHandlerWebDevice);

  const maxWidth = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.MARK_SCAN_USE_BMD_150
  )
    ? MaxPrintWidthDots.BMD_150
    : MaxPrintWidthDots.BMD_155;

  const paperHandlerDriver = new PaperHandlerDriver(
    paperHandlerWebDevice,
    maxWidth
  );

  const openSpy = jest.spyOn(paperHandlerWebDevice, 'open');

  await paperHandlerDriver.connect();

  expect(openSpy).toHaveBeenCalledTimes(1);
});
