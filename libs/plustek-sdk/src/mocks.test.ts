import { sleep } from '@votingworks/utils';
import { ScannerError } from './errors';
import { Errors, MockScannerClient } from './mocks';
import { PaperStatus } from './paper_status';
import { ClientDisconnectedError } from './scanner';

const files: readonly string[] = ['/tmp/a.jpg', '/tmp/b.jpg'];

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

test('unresponsive', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
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
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect((await mock.scan()).err()).toEqual(ScannerError.NoDevices);
  await mock.connect();

  expect((await mock.scan()).err()).toEqual(ScannerError.VtmPsDevReadyNoPaper);
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
  expect((await mock.scan()).ok()).toEqual({ files });
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToEject
  );
  (await mock.simulateLoadSheet(files)).unsafeUnwrap();
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

test('close', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  await mock.connect();
  await mock.close();
  expect(mock.isConnected()).toBeFalsy();
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
