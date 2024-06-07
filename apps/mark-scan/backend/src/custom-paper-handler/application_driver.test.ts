import {
  MinimalWebUsbDevice,
  PaperHandlerDriver,
  getPaperHandlerDriver,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';
import { mockOf } from '@votingworks/test-utils';
import {
  loadAndParkPaper,
  resetAndReconnect,
  scanAndSave,
} from './application_driver';
import { getDefaultPaperHandlerStatus } from './test_utils';

jest.mock('@votingworks/custom-paper-handler');

let driver: PaperHandlerDriver;
let webDevice: MinimalWebUsbDevice;

beforeEach(() => {
  webDevice = {
    open: jest.fn(),
    close: jest.fn(),
    transferOut: jest.fn(),
    transferIn: jest.fn(),
    claimInterface: jest.fn(),
    selectConfiguration: jest.fn(),
  };
  driver = new PaperHandlerDriver(webDevice);
});

test('scanAndSave success', async () => {
  const status: PaperHandlerStatus = {
    ...getDefaultPaperHandlerStatus(),
    parkSensor: true,
  };
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(status);

  await scanAndSave(driver);

  expect(driver.getPaperHandlerStatus).toHaveBeenCalledTimes(1);
  expect(driver.scanAndSave).toHaveBeenCalledTimes(1);
  expect(driver.scanAndSave).toHaveBeenCalledWith(
    expect.stringContaining('.jpeg')
  );
});

test('scanAndSave errors when no paper', async () => {
  const status: PaperHandlerStatus = getDefaultPaperHandlerStatus();
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(status);

  await expect(scanAndSave(driver)).rejects.toThrow('Paper has been removed');
});

test('resetAndReconnect', async () => {
  const delay = 1;
  const newMockDriver = new PaperHandlerDriver(webDevice);
  mockOf(getPaperHandlerDriver).mockResolvedValue(newMockDriver);

  await resetAndReconnect(driver, delay);

  expect(driver.resetScan).toHaveBeenCalledTimes(1);
  expect(driver.disconnect).toHaveBeenCalledTimes(1);
  expect(getPaperHandlerDriver).toHaveBeenCalledTimes(1);
  expect(newMockDriver.initializePrinter).toHaveBeenCalledTimes(1);
  expect(newMockDriver.setLineSpacing).toHaveBeenCalledTimes(1);
  expect(newMockDriver.setLineSpacing).toHaveBeenCalledWith(0);
  expect(newMockDriver.setPrintingSpeed).toHaveBeenCalledTimes(1);
  expect(newMockDriver.setPrintingSpeed).toHaveBeenCalledWith('slow');
});

test('loadAndParkPaper', async () => {
  await loadAndParkPaper(driver);
  expect(driver.loadPaper).toHaveBeenCalled();
  expect(driver.parkPaper).toHaveBeenCalled();
});
