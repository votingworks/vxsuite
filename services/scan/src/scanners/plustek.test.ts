import {
  MockScannerClient,
  PaperStatus,
  ScannerError,
} from '@votingworks/plustek-sdk';
import { err, ok } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import request from 'supertest';
import { sleep } from '@votingworks/utils';
import { makeMockPlustekClient } from '../../test/util/mocks';
import { plustekMockServer, PlustekScanner, withReconnect } from './plustek';

test('plustek scanner cannot get client', async () => {
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(err(new Error('no client for you!'))),
  });
  expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Error);
  expect(await scanner.calibrate()).toEqual(false);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toBeUndefined();
  expect(await batch.acceptSheet()).toEqual(false);
  expect(await batch.reviewSheet()).toEqual(false);
  expect(await batch.rejectSheet()).toEqual(false);
});

test('plustek scanner simplifies underlying status', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  });

  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmDevReadyNoPaper)
  );
  expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.WaitingForPaper);

  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmReadyToScan)
  );
  expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.ReadyToScan);

  plustekClient.getPaperStatus.mockResolvedValueOnce(ok(PaperStatus.Jam));
  expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Error);
});

test('plustek scanner scanning', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  });

  // good scan
  plustekClient.getPaperStatus.mockResolvedValue(
    ok(PaperStatus.VtmReadyToScan)
  );
  plustekClient.scan.mockImplementationOnce(async () => {
    expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Scanning);
    return ok({ files: ['/tmp/a.jpg', '/tmp/b.jpg'] });
  });
  expect(await scanner.scanSheets().scanSheet()).toEqual([
    '/tmp/a.jpg',
    '/tmp/b.jpg',
  ]);

  // scan status not okay
  plustekClient.getPaperStatus.mockResolvedValueOnce(
    err(ScannerError.NoDevices)
  );
  expect(await scanner.scanSheets().scanSheet()).toBeUndefined();

  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmReadyToScan)
  );
  plustekClient.reject.mockResolvedValueOnce(ok());
  await scanner.scanSheets().endBatch();
  expect(plustekClient.reject).toHaveBeenCalledWith({ hold: false });
});

test('scan ready but fails', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  });

  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmReadyToScan)
  );
  plustekClient.scan.mockResolvedValueOnce(err(ScannerError.NoDevices));
  expect(await scanner.scanSheets().scanSheet()).toBeUndefined();
});

test('plustek scanner accept sheet', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  });

  // successful accept
  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmReadyToEject)
  );
  plustekClient.accept.mockImplementationOnce(async () => {
    expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Accepting);
    return ok();
  });
  plustekClient.waitForStatus.mockResolvedValue(
    ok(PaperStatus.VtmDevReadyNoPaper)
  );
  expect(await scanner.scanSheets().acceptSheet()).toEqual(true);

  // failed accept
  plustekClient.accept.mockResolvedValueOnce(err(ScannerError.Fail));
  expect(await scanner.scanSheets().acceptSheet()).toEqual(false);

  // failed to get correct final status
  plustekClient.accept.mockResolvedValueOnce(ok());
  plustekClient.waitForStatus.mockResolvedValue(undefined);
  expect(await scanner.scanSheets().acceptSheet()).toEqual(false);
});

test('plustek scanner review sheet', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  });

  // successful review
  plustekClient.reject.mockImplementationOnce(async () => {
    expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Rejecting);
    return ok();
  });
  plustekClient.waitForStatus.mockResolvedValue(ok(PaperStatus.VtmReadyToScan));
  expect(await scanner.scanSheets().reviewSheet()).toEqual(true);

  // failed review
  plustekClient.reject.mockResolvedValueOnce(err(ScannerError.Fail));
  expect(await scanner.scanSheets().reviewSheet()).toEqual(false);

  // failed to get correct final status
  plustekClient.reject.mockResolvedValueOnce(ok());
  plustekClient.waitForStatus.mockResolvedValue(undefined);
  expect(await scanner.scanSheets().reviewSheet()).toEqual(false);
});

test('plustek scanner reject sheet', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  });

  // successful reject
  plustekClient.reject.mockImplementationOnce(async () => {
    expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Rejecting);
    return ok();
  });
  plustekClient.waitForStatus.mockResolvedValue(
    ok(PaperStatus.VtmDevReadyNoPaper)
  );
  expect(await scanner.scanSheets().rejectSheet()).toEqual(true);

  // failed reject
  plustekClient.reject.mockResolvedValueOnce(err(ScannerError.Fail));
  expect(await scanner.scanSheets().rejectSheet()).toEqual(false);

  // failed to get correct final status
  plustekClient.reject.mockResolvedValueOnce(ok());
  plustekClient.waitForStatus.mockResolvedValue(undefined);
  expect(await scanner.scanSheets().rejectSheet()).toEqual(false);
});

test('plustek scanner reject sheet w/alwaysHoldOnReject', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner(
    {
      get: jest.fn().mockResolvedValue(ok(plustekClient)),
    },
    true
  );

  plustekClient.reject.mockResolvedValueOnce(ok());
  plustekClient.waitForStatus.mockResolvedValue(ok(PaperStatus.VtmReadyToScan));
  expect(await scanner.scanSheets().rejectSheet()).toEqual(true);
});

test('plustek scanner calibrate', async () => {
  const plustekClient = makeMockPlustekClient();
  const scanner = new PlustekScanner(
    {
      get: jest.fn().mockResolvedValue(ok(plustekClient)),
    },
    true
  );

  plustekClient.calibrate.mockImplementationOnce(async () => {
    expect(await scanner.getStatus()).toEqual(Scan.ScannerStatus.Calibrating);
    return ok();
  });
  expect(await scanner.calibrate()).toEqual(true);

  plustekClient.calibrate.mockResolvedValueOnce(
    err(ScannerError.VtmPsDevReadyNoPaper)
  );
  expect(await scanner.calibrate()).toEqual(false);
});

test('mock server', async () => {
  const client = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  });
  const app = plustekMockServer(client);

  // before connect fails
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({ files: ['front.jpg', 'back.jpg'] })
    .expect(400);

  await client.connect();

  // bad request
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({
      /* missing files */
    })
    .expect(400);

  // successful
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({ files: ['front.jpg', 'back.jpg'] })
    .expect(200);

  // removes mock
  await request(app).delete('/mock').expect(200);

  // fails because it's already removed
  await request(app).delete('/mock').expect(400);
});

test('withReconnect', async () => {
  const client = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  });
  await client.connect();
  async function makeUnresponsiveClient() {
    const unresponsiveClient = new MockScannerClient({
      passthroughDuration: 0,
      toggleHoldDuration: 0,
    });
    await unresponsiveClient.connect();
    unresponsiveClient.simulateUnresponsive();
    return ok(unresponsiveClient);
  }

  // set up provider to fail before eventually succeeding
  const getClient = jest
    .fn()
    .mockResolvedValueOnce(makeUnresponsiveClient())
    .mockResolvedValueOnce(makeUnresponsiveClient())
    .mockResolvedValueOnce(makeUnresponsiveClient())
    .mockResolvedValueOnce(ok(client));
  const provider = withReconnect({ get: getClient });

  // ensure we tried until we got to the good client
  const wrappedClient = (await provider.get()).unsafeUnwrap();
  expect(wrappedClient).toBeDefined();
  expect([PaperStatus.VtmDevReadyNoPaper, PaperStatus.NoPaperStatus]).toContain(
    (await wrappedClient.getPaperStatus()).unsafeUnwrap()
  );
  expect(getClient).toHaveBeenCalledTimes(4);

  // getting the client again should return the same one
  const wrappedClientAgain = (await provider.get()).unsafeUnwrap();
  expect(wrappedClientAgain).toBe(wrappedClient);
  expect(getClient).toHaveBeenCalledTimes(4);

  // interacting with the good client works
  (await client.simulateLoadSheet(['/tmp/a.jpg', '/tmp/b.jpg'])).unsafeUnwrap();
  (await wrappedClient.scan()).unsafeUnwrap();
  (await wrappedClient.reject({ hold: true })).unsafeUnwrap();
  await sleep(1);
  (await wrappedClient.accept()).unsafeUnwrap();
  (
    await client.simulateLoadSheet(['/tmp/blank.jpg', '/tmp/blank.jpg'])
  ).unsafeUnwrap();
  (await wrappedClient.calibrate()).unsafeUnwrap();
});

test('withReconnect only re-creates the client once per failure', async () => {
  const client = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  });
  await client.connect();
  const unresponsiveClient = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  });
  await client.connect();
  unresponsiveClient.simulateUnresponsive();

  // set up provider to once
  const getClient = jest
    .fn()
    .mockResolvedValueOnce(ok(unresponsiveClient))
    .mockResolvedValueOnce(ok(client));
  const provider = withReconnect({ get: getClient });

  const wrappedClient = (await provider.get()).unsafeUnwrap();

  await Promise.all([
    wrappedClient.getPaperStatus(),
    wrappedClient.getPaperStatus(),
    wrappedClient.getPaperStatus(),
    wrappedClient.getPaperStatus(),
  ]);

  expect(getClient).toHaveBeenCalledTimes(2);
});
