import { Buffer } from 'buffer';
import { SheetOf } from '@votingworks/types';
import { err, ok, Result, sleep, typedAs } from '@votingworks/basics';
import {
  ErrorCode,
  FormMovement,
  ImageColorDepthType,
  ImageFileFormat,
  ImageResolution,
  ImageFromScanner,
  ScanSide,
  ScannerStatus,
  ReleaseType,
} from '../types';
import { Errors, MockCustomScanner } from './scanner';

const files: SheetOf<ImageFromScanner> = [
  {
    scanSide: ScanSide.A,
    imageBuffer: Buffer.alloc(0),
    imageWidth: 0,
    imageHeight: 0,
    imageDepth: ImageColorDepthType.Grey8bpp,
    imageFormat: ImageFileFormat.Jpeg,
    imageResolution: ImageResolution.RESOLUTION_200_DPI,
  },
  {
    scanSide: ScanSide.B,
    imageBuffer: Buffer.alloc(0),
    imageWidth: 0,
    imageHeight: 0,
    imageDepth: ImageColorDepthType.Grey8bpp,
    imageFormat: ImageFileFormat.Jpeg,
    imageResolution: ImageResolution.RESOLUTION_200_DPI,
  },
];

function expectNoPaper(getStatusResult: Result<ScannerStatus, ErrorCode>) {
  expect(getStatusResult).toEqual(
    ok(
      expect.objectContaining(
        typedAs<Partial<ScannerStatus>>({
          isTicketOnEnterA4: false,
        })
      )
    )
  );
}

function expectReadyToScan(getStatusResult: Result<ScannerStatus, ErrorCode>) {
  expect(getStatusResult).toEqual(
    ok(
      expect.objectContaining(
        typedAs<Partial<ScannerStatus>>({
          isTicketOnEnterA4: true,
          isTicketOnExit: false,
        })
      )
    )
  );
}

function expectReadyToAccept(
  getStatusResult: Result<ScannerStatus, ErrorCode>
) {
  expect(getStatusResult).toEqual(
    ok(
      expect.objectContaining(
        typedAs<Partial<ScannerStatus>>({
          isTicketOnEnterA4: false,
          isTicketOnExit: true,
        })
      )
    )
  );
}

function expectBothSidesHavePaper(
  getStatusResult: Result<ScannerStatus, ErrorCode>
) {
  expect(getStatusResult).toEqual(
    ok(
      expect.objectContaining(
        typedAs<Partial<ScannerStatus>>({
          isTicketOnEnterA4: true,
          isTicketOnExit: true,
        })
      )
    )
  );
}

function expectJamStatus(getStatusResult: Result<ScannerStatus, ErrorCode>) {
  expect(getStatusResult).toEqual(
    ok(
      expect.objectContaining(
        typedAs<Partial<ScannerStatus>>({
          isPaperJam: true,
        })
      )
    )
  );
}

function expectJamError(result: Result<unknown, ErrorCode>) {
  expect(result).toEqual(err(expect.anything()));
  expect([
    ErrorCode.PaperJam,
    ErrorCode.ScannerJam,
    ErrorCode.PaperHeldBack,
  ]).toContain(result.unsafeUnwrapErr());
}

beforeEach(() => {
  jest.useRealTimers();
});

test('connection', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.connect()).toEqual(ok());
  expect(mock.isConnected()).toBeTruthy();
  await mock.disconnect();
  expect(mock.isConnected()).toBeFalsy();
});

test('loading', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });

  expect(await mock.simulateLoadSheet(files)).toEqual(err(Errors.NotConnected));
  expect(await mock.getStatus()).toEqual(err(ErrorCode.ScannerOffline));
  expect(await mock.simulateRemoveSheet()).toEqual(err(Errors.NotConnected));
  expect(await mock.simulateRemoveSheetFromBack()).toEqual(
    err(Errors.NotConnected)
  );

  expect(await mock.connect()).toEqual(ok());
  expectNoPaper(await mock.getStatus());
  expect(await mock.simulateRemoveSheet()).toEqual(err(Errors.NoPaperToRemove));
  expect((await mock.simulateLoadSheet(files)).err()).toBeUndefined();
  expectReadyToScan(await mock.getStatus());
  expect(await mock.simulateLoadSheet(files)).toEqual(
    err(Errors.DuplicateLoad)
  );
  expect((await mock.simulateRemoveSheet()).err()).toBeUndefined();
  expectNoPaper(await mock.getStatus());
  expect((await mock.simulateLoadSheet(files)).err()).toBeUndefined();
  expectReadyToScan(await mock.getStatus());
});

test('power off', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
  });

  expect(await mock.connect()).toEqual(ok());
  expect(mock.isConnected()).toEqual(true);
  mock.simulatePowerOff();

  expect(mock.isConnected()).toEqual(true);
  expect(await mock.simulateLoadSheet(files)).toEqual(err(Errors.Unresponsive));
  expect(await mock.simulateRemoveSheet()).toEqual(err(Errors.Unresponsive));
  expect(await mock.simulateRemoveSheetFromBack()).toEqual(
    err(Errors.Unresponsive)
  );
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(
    err(ErrorCode.ScannerOffline)
  );
  expect(await mock.getStatus()).toEqual(err(ErrorCode.ScannerOffline));
  expect(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD)).toEqual(
    err(ErrorCode.ScannerOffline)
  );
  expect(await mock.scan()).toEqual(err(ErrorCode.ScannerOffline));
  await mock.disconnect();

  // during scan
  mock.simulatePowerOn();
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  const scanResult = mock.scan();
  mock.simulatePowerOff();
  expect(await scanResult).toEqual(err(ErrorCode.ScannerOffline));

  // during accept from front
  mock.simulatePowerOn('ready_to_scan');
  const acceptResult = mock.move(FormMovement.EJECT_PAPER_FORWARD);
  mock.simulatePowerOff();
  expect(await acceptResult).toEqual(err(ErrorCode.ScannerOffline));

  // during accept from back
  mock.simulatePowerOn('ready_to_eject');
  const acceptBackResult = mock.move(FormMovement.EJECT_PAPER_FORWARD);
  mock.simulatePowerOff();
  expect(await acceptBackResult).toEqual(err(ErrorCode.ScannerOffline));

  // during reject
  mock.simulatePowerOn('ready_to_eject');
  const rejectResult = mock.move(FormMovement.RETRACT_PAPER_BACKWARD);
  mock.simulatePowerOff();
  expect(await rejectResult).toEqual(err(ErrorCode.ScannerOffline));
});

test('scanning', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.scan()).toEqual(err(ErrorCode.ScannerOffline));
  expect(await mock.connect()).toEqual(ok());

  expect(await mock.simulateRemoveSheetFromBack()).toEqual(
    err(Errors.NoPaperToRemove)
  );
  expect(await mock.scan()).toEqual(err(ErrorCode.NoDocumentToBeScanned));
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.scan()).toEqual(ok(files));
  expect(await mock.scan()).toEqual(err(ErrorCode.NoDocumentToBeScanned));
  expectReadyToAccept(await mock.getStatus());
});

test('accept', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(
    err(ErrorCode.ScannerOffline)
  );
  expect(await mock.connect()).toEqual(ok());

  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(
    err(ErrorCode.NoDocumentScanned)
  );

  // accept w/o scan
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(ok());
  expectNoPaper(await mock.getStatus());

  // accept w/scan
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.scan()).toEqual(ok(files));
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(ok());
  expectNoPaper(await mock.getStatus());
});

test('reject & hold', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD)).toEqual(
    err(ErrorCode.ScannerOffline)
  );
  expect(await mock.connect()).toEqual(ok());

  expect(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD)).toEqual(
    err(ErrorCode.NoDocumentScanned)
  );

  // reject w/o scan
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD)).toEqual(ok());
  expectNoPaper(await mock.getStatus());
  await sleep(1);
  expectReadyToScan(await mock.getStatus());

  // reset
  expect(await mock.simulateRemoveSheet()).toEqual(ok());

  // reject w/scan
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.scan()).toEqual(ok(files));
  expect(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD)).toEqual(ok());
  expectNoPaper(await mock.getStatus());
  await sleep(1);
  expectReadyToScan(await mock.getStatus());
});

test('paper held at both sides', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
  });
  expect(await mock.scan()).toEqual(err(ErrorCode.ScannerOffline));
  expect(await mock.connect()).toEqual(ok());

  expect(await mock.scan()).toEqual(err(ErrorCode.NoDocumentToBeScanned));
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  const scanResult = mock.scan();
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await scanResult).toEqual(err(ErrorCode.ScannerError));
  expectBothSidesHavePaper(await mock.getStatus());
  expect(await mock.scan()).toEqual(err(ErrorCode.ScanImpeded));
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(
    err(ErrorCode.ScanImpeded)
  );
  expect(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD)).toEqual(
    err(ErrorCode.ScanImpeded)
  );
  expect(await mock.simulateRemoveSheetFromBack()).toEqual(ok());

  // Removing the front sheet fixes it
  expect(await mock.scan()).toEqual(ok(files));
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expectBothSidesHavePaper(await mock.getStatus());
  expect(await mock.simulateRemoveSheet()).toEqual(ok());
  expectReadyToAccept(await mock.getStatus());

  // TODO: Inserting a second sheet during accept
  // const acceptResult = mock.move(FormMovement.EJECT_PAPER_FORWARD);
  // expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  // expectJamError(await acceptResult);
  // expectReadyToScan(await mock.getStatus());
});

test('paper jam', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.connect()).toEqual(ok());

  // Jam on scan
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  mock.simulateJamOnNextOperation();
  expectJamError(await mock.scan());
  expectJamStatus(await mock.getStatus());
  // Once jammed, still jammed til paper removed
  expectJamError(await mock.scan());
  expectJamStatus(await mock.getStatus());
  expect(await mock.simulateRemoveSheet()).toEqual(ok());
  expectNoPaper(await mock.getStatus());

  // Jam on reject with paper in back
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.scan()).toEqual(ok(files));
  mock.simulateJamOnNextOperation();
  expectJamError(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD));
  expectJamStatus(await mock.getStatus());
  expectJamError(await mock.move(FormMovement.RETRACT_PAPER_BACKWARD));
  expectJamStatus(await mock.getStatus());
  expect(await mock.simulateRemoveSheet()).toEqual(ok());
  expectNoPaper(await mock.getStatus());

  // Jam on accept with paper in front
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  mock.simulateJamOnNextOperation();
  expectJamError(await mock.move(FormMovement.EJECT_PAPER_FORWARD));
  expectJamStatus(await mock.getStatus());
  expectJamError(await mock.move(FormMovement.EJECT_PAPER_FORWARD));
  expectJamStatus(await mock.getStatus());
  expect(await mock.simulateRemoveSheet()).toEqual(ok());
  expectNoPaper(await mock.getStatus());

  // Jam on accept with paper in the back
  // This completes successfully even though the paper doesn't get dropped
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  expect(await mock.scan()).toEqual(ok(files));
  mock.simulateJamOnNextOperation();
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(ok());
  expectReadyToAccept(await mock.getStatus());
  expect(await mock.move(FormMovement.EJECT_PAPER_FORWARD)).toEqual(ok());
  expectNoPaper(await mock.getStatus());
});

test('scanning errors', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.connect()).toEqual(ok());

  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
  const scanResult = mock.scan();
  mock.simulateScanError('error_feeding');
  expect([ErrorCode.ScanImpeded, ErrorCode.PaperHeldBack]).toContain(
    (await scanResult).unsafeUnwrapErr()
  );
  expectReadyToScan(await mock.getStatus());

  expect(await mock.simulateRemoveSheet()).toEqual(ok());
  expectNoPaper(await mock.getStatus());
  expect(await mock.simulateLoadSheet(files)).toEqual(ok());
});

test('close', async () => {
  const mock = new MockCustomScanner({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  });
  expect(await mock.connect()).toEqual(ok());
  await mock.disconnect();
  expect(mock.isConnected()).toBeFalsy();
});

test('operation timing', async () => {
  jest.useFakeTimers();

  const mock = new MockCustomScanner();
  expect(await mock.connect()).toEqual(ok());

  const loadPromise = mock.simulateLoadSheet(files);
  jest.advanceTimersByTime(100);
  (await loadPromise).unsafeUnwrap();

  const scanPromise = mock.scan();
  jest.advanceTimersByTime(1000);
  expect(await scanPromise).toEqual(ok(files));
});

test('getReleaseVersion', async () => {
  const mock = new MockCustomScanner();
  expect(await mock.getReleaseVersion(ReleaseType.Model)).toEqual(
    ok('Model 1.0.0')
  );
});

test('resetHardware', async () => {
  const mock = new MockCustomScanner();
  expect(await mock.resetHardware()).toEqual(ok());
});
