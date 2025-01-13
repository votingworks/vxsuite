import { expect, test } from 'vitest';
import { typedAs } from '@votingworks/basics';
import fc from 'fast-check';
import { arbitraryStatusInternalMessage } from '../test/arbitraries';
import { StatusInternalMessage } from './protocol';
import { convertFromInternalStatus } from './status';
import { DocumentSensorStatus, ScannerA4Status, ScannerStatus } from './types';

test('convertFromInternalStatus', () => {
  fc.assert(
    fc.property(arbitraryStatusInternalMessage(), (status) => {
      convertFromInternalStatus(status);
    })
  );
});

test('convertFromInternalStatus endScanA/endScanB', () => {
  const status = fc.sample(
    arbitraryStatusInternalMessage(),
    1
  )[0] as StatusInternalMessage;

  expect(
    convertFromInternalStatus({ ...status, endScanA: 'S'.charCodeAt(0) })
      .a4Status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerA4Status>>({
        endScanSideA: true,
      })
    )
  );

  expect(
    convertFromInternalStatus({ ...status, endScanA: 0 }).a4Status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerA4Status>>({
        endScanSideA: false,
      })
    )
  );

  expect(
    convertFromInternalStatus({ ...status, endScanB: 'S'.charCodeAt(0) })
      .a4Status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerA4Status>>({
        endScanSideB: true,
      })
    )
  );

  expect(
    convertFromInternalStatus({ ...status, endScanB: 0 }).a4Status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerA4Status>>({
        endScanSideB: false,
      })
    )
  );
});

test('convertFromInternalStatus paperJam', () => {
  const status = fc.sample(
    arbitraryStatusInternalMessage(),
    1
  )[0] as StatusInternalMessage;

  expect(
    convertFromInternalStatus({
      ...status,
      paperJam: 'J'.charCodeAt(0),
      docSensor: status.docSensor & ~DocumentSensorStatus.ENCODER_ERROR,
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isPaperJam: true,
      })
    )
  );

  expect(
    convertFromInternalStatus({
      ...status,
      paperJam: 'J'.charCodeAt(0),
      docSensor: status.docSensor | DocumentSensorStatus.ENCODER_ERROR,
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isJamPaperHeldBack: true,
      })
    )
  );
});

test('convertFromInternalStatus canceled', () => {
  const status = fc.sample(
    arbitraryStatusInternalMessage(),
    1
  )[0] as StatusInternalMessage;

  expect(
    convertFromInternalStatus({
      ...status,
      cancel: 'C'.charCodeAt(0),
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isScanCanceled: true,
      })
    )
  );

  expect(
    convertFromInternalStatus({
      ...status,
      cancel: 0,
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isScanCanceled: false,
      })
    )
  );
});

test('convertFromInternalStatus motorMove', () => {
  const status = fc.sample(
    arbitraryStatusInternalMessage(),
    1
  )[0] as StatusInternalMessage;

  expect(
    convertFromInternalStatus({
      ...status,
      motorMove: 'M'.charCodeAt(0),
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isMotorOn: true,
        isScanInProgress: false,
      })
    )
  );

  expect(
    convertFromInternalStatus({
      ...status,
      motorMove: 'S'.charCodeAt(0),
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isMotorOn: true,
        isScanInProgress: true,
      })
    )
  );

  expect(
    convertFromInternalStatus({
      ...status,
      motorMove: 0,
    }).status
  ).toEqual(
    expect.objectContaining(
      typedAs<Partial<ScannerStatus>>({
        isMotorOn: false,
        isScanInProgress: false,
      })
    )
  );
});
