import { sleep } from '@votingworks/utils';
import { ScannerError } from './errors';
import { Errors, MockScannerClient } from './mocks';
import { PaperStatus } from './paper_status';
import { ClientDisconnectedError, InvalidClientResponseError } from './scanner';

const files: [string, string] = ['/tmp/a.jpg', '/tmp/b.jpg'];

function expectNoPaper(status?: PaperStatus) {
  expect([PaperStatus.VtmDevReadyNoPaper, PaperStatus.NoPaperStatus]).toContain(
    status
  );
}

function expectJam(status?: PaperStatus) {
  expect([
    PaperStatus.Jam,
    PaperStatus.VtmFrontAndBackSensorHavePaperReady,
  ]).toContain(status);
}

beforeEach(() => {
  jest.useRealTimers();
});

test('connection', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  await mock.connect();
  expect(mock.isConnected()).toBeTruthy();
  await mock.disconnect();
  expect(mock.isConnected()).toBeFalsy();
});

test('loading', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });

  expect((await mock.simulateLoadSheet(files)).err()).toEqual(
    Errors.NotConnected
  );
  expect((await mock.getPaperStatus()).err()).toEqual(ScannerError.NoDevices);
  expect((await mock.simulateRemoveSheet()).err()).toEqual(Errors.NotConnected);

  await mock.connect();
  expectNoPaper((await mock.getPaperStatus()).ok());
  expect((await mock.simulateRemoveSheet()).err()).toEqual(
    Errors.NoPaperToRemove
  );
  expect((await mock.simulateLoadSheet(files)).err()).toBeUndefined();
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToScan
  );
  expect((await mock.simulateLoadSheet(files)).err()).toEqual(
    Errors.DuplicateLoad
  );
  expect((await mock.simulateRemoveSheet()).err()).toBeUndefined();
  expectNoPaper((await mock.getPaperStatus()).ok());
  expect((await mock.simulateLoadSheet(files)).err()).toBeUndefined();
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToScan
  );
});

test('power off', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
  });

  await mock.connect();
  expect(mock.isConnected()).toEqual(true);
  mock.simulatePowerOff();

  expect(mock.isConnected()).toEqual(true);
  expect((await mock.simulateLoadSheet(files)).err()).toEqual(
    Errors.Unresponsive
  );
  expect((await mock.simulateRemoveSheet()).err()).toEqual(Errors.Unresponsive);
  expect((await mock.accept()).err()).toEqual(ScannerError.SaneStatusIoError);
  expect((await mock.calibrate()).err()).toEqual(
    ScannerError.SaneStatusIoError
  );
  expect((await mock.getPaperStatus()).err()).toEqual(
    ScannerError.SaneStatusIoError
  );
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.SaneStatusIoError
  );
  expect((await mock.scan()).err()).toEqual(ScannerError.SaneStatusIoError);
  (await mock.close()).unsafeUnwrap();

  // during scan
  mock.simulatePowerOn();
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  const scanResult = mock.scan();
  mock.simulatePowerOff();
  expect((await scanResult).err()).toEqual(
    ScannerError.PaperStatusErrorFeeding
  );

  // during accept from front
  mock.simulatePowerOn('ready_to_scan');
  const acceptResult = mock.accept();
  mock.simulatePowerOff();
  expect((await acceptResult).err()).toEqual(ScannerError.PaperStatusJam);

  // during accept from back
  mock.simulatePowerOn('ready_to_eject');
  const acceptBackResult = mock.accept();
  mock.simulatePowerOff();
  expect((await acceptBackResult).err()).toEqual(ScannerError.PaperStatusJam);

  // during reject
  mock.simulatePowerOn('ready_to_eject');
  const rejectResult = mock.reject({ hold: true });
  mock.simulatePowerOff();
  expect((await rejectResult).err()).toEqual(ScannerError.PaperStatusJam);
});

test('crashed', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });

  await mock.connect();
  expect(mock.isConnected()).toEqual(true);
  mock.simulatePlustekctlCrash();

  expect(mock.isConnected()).toEqual(false);
  expect((await mock.simulateLoadSheet(files)).err()).toEqual(Errors.Crashed);
  expect((await mock.simulateRemoveSheet()).err()).toEqual(Errors.Crashed);
  expect((await mock.accept()).err()).toBeInstanceOf(ClientDisconnectedError);
  expect((await mock.calibrate()).err()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect((await mock.getPaperStatus()).err()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect((await mock.reject({ hold: true })).err()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect((await mock.scan()).err()).toBeInstanceOf(ClientDisconnectedError);
  (await mock.close()).unsafeUnwrap();
});

test('scanning', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect((await mock.scan()).err()).toEqual(ScannerError.NoDevices);
  await mock.connect();

  expect((await mock.scan()).err()).toEqual(ScannerError.VtmPsDevReadyNoPaper);
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  expect((await mock.scan()).ok()).toEqual({ files });
  expect((await mock.scan()).err()).toEqual(ScannerError.VtmPsReadyToEject);
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToEject
  );
});

test('accept', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect((await mock.accept()).err()).toEqual(ScannerError.NoDevices);
  await mock.connect();

  expect((await mock.accept()).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  );

  // accept w/o scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  (await mock.accept()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());

  // accept w/scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  await mock.scan();
  (await mock.accept()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
});

test('reject & hold', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.NoDevices
  );
  await mock.connect();

  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  );

  // reject w/o scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  (await mock.reject({ hold: true })).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
  await sleep(1);
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToScan
  );

  // reset
  (await mock.simulateRemoveSheet()).unsafeUnwrap();

  // reject w/scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  await mock.scan();
  (await mock.reject({ hold: true })).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
  await sleep(1);
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToScan
  );
});

test('reject w/o hold', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect((await mock.reject({ hold: false })).err()).toEqual(
    ScannerError.NoDevices
  );
  await mock.connect();

  expect((await mock.reject({ hold: false })).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  );

  // reject w/o scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  (await mock.reject({ hold: false })).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());

  // reject w/scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  await mock.scan();
  (await mock.reject({ hold: false })).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
});

test('calibrate', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect((await mock.calibrate()).err()).toEqual(ScannerError.NoDevices);
  await mock.connect();

  expect((await mock.calibrate()).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  );
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  await mock.scan();
  expect((await mock.calibrate()).err()).toEqual(ScannerError.SaneStatusNoDocs);
  await mock.reject({ hold: true });
  await sleep(1);
  (await mock.calibrate()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
});

test('paper held at both sides', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
  });
  expect((await mock.scan()).err()).toEqual(ScannerError.NoDevices);
  await mock.connect();

  expect((await mock.scan()).err()).toEqual(ScannerError.VtmPsDevReadyNoPaper);
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  const scanResult = mock.scan();
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  expect((await scanResult).err()).toEqual(
    ScannerError.PaperStatusErrorFeeding
  );
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmBothSideHavePaper
  );
  expect((await mock.scan()).err()).toEqual(ScannerError.VtmBothSideHavePaper);
  expect((await mock.accept()).err()).toEqual(
    ScannerError.VtmBothSideHavePaper
  );
  expect((await mock.reject({ hold: false })).err()).toEqual(
    ScannerError.VtmBothSideHavePaper
  );
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.VtmBothSideHavePaper
  );
  // On calibrate, plustek will just eject the back paper and go for it
  (await mock.calibrate()).unsafeUnwrap();

  // Removing the front sheet fixes it
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  (await mock.scan()).unsafeUnwrap();
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmBothSideHavePaper
  );
  (await mock.simulateRemoveSheet()).unsafeUnwrap();
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToEject
  );

  // Inserting a second sheet during accept
  const acceptResult = mock.accept();
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  expect((await acceptResult).err()).toEqual(ScannerError.PaperStatusJam);
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToScan
  );
});

test('paper jam', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  await mock.connect();

  // Jam on scan
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  mock.simulateJamOnNextOperation();
  expect((await mock.scan()).err()).toEqual(ScannerError.PaperStatusJam);
  expectJam((await mock.getPaperStatus()).ok());
  // Once jammed, still jammed til paper removed
  expect((await mock.scan()).err()).toEqual(ScannerError.PaperStatusJam);
  expectJam((await mock.getPaperStatus()).ok());
  (await mock.simulateRemoveSheet()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());

  // Jam on reject with paper in back
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  (await mock.scan()).unsafeUnwrap();
  mock.simulateJamOnNextOperation();
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.PaperStatusJam
  );
  expectJam((await mock.getPaperStatus()).ok());
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.PaperStatusJam
  );
  expectJam((await mock.getPaperStatus()).ok());
  (await mock.simulateRemoveSheet()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());

  // Jam on accept with paper in front
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  mock.simulateJamOnNextOperation();
  expect((await mock.accept()).err()).toEqual(ScannerError.PaperStatusJam);
  expectJam((await mock.getPaperStatus()).ok());
  expect((await mock.accept()).err()).toEqual(ScannerError.PaperStatusJam);
  expectJam((await mock.getPaperStatus()).ok());
  (await mock.simulateRemoveSheet()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());

  // Jam on accept with paper in the back
  // This completes successfully even though the paper doesn't get dropped
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  (await mock.scan()).unsafeUnwrap();
  mock.simulateJamOnNextOperation();
  (await mock.accept()).unsafeUnwrap();
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToEject
  );
  (await mock.accept()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());

  // Jam on calibrate
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  mock.simulateJamOnNextOperation();
  expect((await mock.calibrate()).err()).toEqual(ScannerError.PaperStatusJam);
  expectJam((await mock.getPaperStatus()).ok());
  expect((await mock.calibrate()).err()).toEqual(ScannerError.PaperStatusJam);
  expectJam((await mock.getPaperStatus()).ok());
  (await mock.simulateRemoveSheet()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
});

test('scanning errors', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  await mock.connect();

  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  let scanResult = mock.scan();
  mock.simulateScanError('error_feeding');
  expect([
    ScannerError.PaperStatusErrorFeeding,
    ScannerError.PaperStatusNoPaper,
  ]).toContain((await scanResult).err());
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToScan
  );

  (await mock.simulateRemoveSheet()).unsafeUnwrap();
  expectNoPaper((await mock.getPaperStatus()).ok());
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  scanResult = mock.scan();
  mock.simulateScanError('only_one_file_returned');
  expect((await scanResult).err()).toEqual(
    new InvalidClientResponseError('expected two files, got [ file1.jpg ]')
  );
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToEject
  );
});

test('close', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  await mock.connect();
  await mock.close();
  expect(mock.isConnected()).toBeFalsy();
});

test('freeze and kill', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
    frozenTimeout: 1_000,
  });
  await mock.connect();
  mock.simulatePlustekctlFreeze();

  // After freeze, paper status hangs
  const paperStatusPromise = mock.getPaperStatus();
  let paperStatusFinished = false;
  paperStatusPromise.finally(() => {
    paperStatusFinished = true;
  });
  await sleep(500);
  expect(paperStatusFinished).toBe(false);
  await paperStatusPromise;
  expect(paperStatusFinished).toBe(true);

  // Same with close
  const closePromise = mock.close();
  let closeFinished = false;
  closePromise.catch(() => {
    closeFinished = true;
  });
  await sleep(500);
  expect(closeFinished).toBe(false);
  await expect(closePromise).rejects.toThrow(Error);
  expect(closeFinished).toBe(true);

  // Only killing stops the madness
  mock.kill();
  await mock.connect();
  expectNoPaper((await mock.getPaperStatus()).ok());
});

test('operation timing', async () => {
  jest.useFakeTimers();

  const mock = new MockScannerClient();
  await mock.connect();

  const loadPromise = mock.simulateLoadSheet(files);
  jest.advanceTimersByTime(100);
  (await loadPromise).unsafeUnwrap();

  const scanPromise = mock.scan();
  jest.advanceTimersByTime(1000);
  await scanPromise;
});
