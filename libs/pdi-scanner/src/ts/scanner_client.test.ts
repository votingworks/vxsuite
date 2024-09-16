import { spawn } from 'node:child_process';
import {
  backendWaitFor,
  mockChildProcess as createMockChildProcess,
  MockChildProcess,
  mockOf,
} from '@votingworks/test-utils';
import { err, iter, ok, sleep } from '@votingworks/basics';
import { fromGrayScale } from '@votingworks/image-utils';
import { Buffer } from 'node:buffer';
import {
  createPdiScannerClient,
  DoubleFeedDetectionCalibrationConfig,
  PdictlEvent,
  SCAN_IMAGE_WIDTH,
  ScannerEvent,
  ScannerStatus,
} from './scanner_client';

jest.mock('node:child_process');
let mockChildProcess: MockChildProcess;

beforeEach(() => {
  mockChildProcess = createMockChildProcess();
  mockOf(spawn).mockImplementation(() => mockChildProcess);
});

function mockStdoutResponse(response: object): void {
  setTimeout(() => {
    mockChildProcess.stdout.emit('data', `${JSON.stringify(response)}\n`);
  });
}

function expectStdinCommands(commands: object[]): void {
  expect(mockChildProcess.stdin.toString()).toEqual(
    commands.map((command) => `${JSON.stringify(command)}\n`).join('')
  );
}

function expectStdinCommand(command: object): void {
  expectStdinCommands([command]);
}

test('connects', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.connect()).toEqual(ok());
  expectStdinCommand({ command: 'connect' });
});

// In all tests below, we omit the connect command, even though normally you
// would need to connect first, since connect doesn't change any state within
// the TS client, only in pdictl itself, which we're mocking.

const scannerStatus: ScannerStatus = {
  rearLeftSensorCovered: false,
  rearRightSensorCovered: false,
  branderPositionSensorCovered: false,
  hiSpeedMode: true,
  coverOpen: false,
  scannerEnabled: false,
  frontLeftSensorCovered: false,
  frontM1SensorCovered: false,
  frontM2SensorCovered: false,
  frontM3SensorCovered: false,
  frontM4SensorCovered: false,
  frontM5SensorCovered: false,
  frontRightSensorCovered: false,
  scannerReady: true,
  xmtAborted: false,
  documentJam: false,
  scanArrayPixelError: false,
  inDiagnosticMode: false,
  documentInScanner: false,
  calibrationOfUnitNeeded: false,
};

test('getScannerStatus', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({
    response: 'scannerStatus',
    status: scannerStatus,
  });
  expect(await client.getScannerStatus()).toEqual(ok(scannerStatus));
  expectStdinCommand({ command: 'getScannerStatus' });
});

test('enableScanning({ doubleFeedDetectionEnabled: true, paperLengthInches: 11 })', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(
    await client.enableScanning({
      doubleFeedDetectionEnabled: true,
      paperLengthInches: 11,
    })
  ).toEqual(ok());
  expectStdinCommand({
    command: 'enableScanning',
    doubleFeedDetectionEnabled: true,
    paperLengthInches: 11,
  });
});

test('enableScanning({ doubleFeedDetectionEnabled: false, paperLengthInches: 14 })', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(
    await client.enableScanning({
      doubleFeedDetectionEnabled: false,
      paperLengthInches: 14,
    })
  ).toEqual(ok());
  expectStdinCommand({
    command: 'enableScanning',
    doubleFeedDetectionEnabled: false,
    paperLengthInches: 14,
  });
});

test('disableScanning', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.disableScanning()).toEqual(ok());
  expectStdinCommand({ command: 'disableScanning' });
});

test('ejectDocument(toRear)', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.ejectDocument('toRear')).toEqual(ok());
  expectStdinCommand({ command: 'ejectDocument', ejectMotion: 'toRear' });
});

test('ejectDocument(toFrontAndHold)', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.ejectDocument('toFrontAndHold')).toEqual(ok());
  expectStdinCommand({
    command: 'ejectDocument',
    ejectMotion: 'toFrontAndHold',
  });
});

test('calibrateDoubleFeedDetection', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.calibrateDoubleFeedDetection('double')).toEqual(ok());
  mockStdoutResponse({ response: 'ok' });
  expect(await client.calibrateDoubleFeedDetection('single')).toEqual(ok());
  expectStdinCommands([
    {
      command: 'calibrateDoubleFeedDetection',
      calibrationType: 'double',
    },
    {
      command: 'calibrateDoubleFeedDetection',
      calibrationType: 'single',
    },
  ]);
});

test('getDoubleFeedDetectionCalibrationConfig', async () => {
  const client = createPdiScannerClient();
  const expectedConfig: DoubleFeedDetectionCalibrationConfig = {
    ledIntensity: 100,
    singleSheetCalibrationValue: 50,
    doubleSheetCalibrationValue: 200,
    thresholdValue: 125,
  };
  mockStdoutResponse({
    response: 'doubleFeedDetectionCalibrationConfig',
    config: expectedConfig,
  });
  expect(await client.getDoubleFeedDetectionCalibrationConfig()).toEqual(
    ok(expectedConfig)
  );
  expectStdinCommand({ command: 'getDoubleFeedDetectionCalibrationConfig' });

  mockStdoutResponse({ response: 'error', code: 'disconnected' });
  expect(await client.getDoubleFeedDetectionCalibrationConfig()).toEqual(
    err({ response: 'error', code: 'disconnected' })
  );

  mockStdoutResponse({ response: 'ok' });
  expect(await client.getDoubleFeedDetectionCalibrationConfig()).toEqual(
    err({
      code: 'other',
      message: 'Unexpected response: ok',
    })
  );
});

test('disconnect', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.disconnect()).toEqual(ok());
  expectStdinCommand({ command: 'disconnect' });
});

test('exit', async () => {
  const client = createPdiScannerClient();
  let closed = false;
  setTimeout(() => {
    closed = true;
    mockChildProcess.emit('close', 0);
  });
  expect(await client.exit()).toEqual(ok());
  expectStdinCommand({ command: 'exit' });

  while (!closed) {
    await sleep(0);
  }

  expect(await client.getScannerStatus()).toEqual(
    err({
      response: 'error',
      code: 'exited',
    })
  );
});

test('addListener/removeListener', async () => {
  const client = createPdiScannerClient();
  const listener1 = jest.fn();
  client.addListener(listener1);
  const scanStartEvent: ScannerEvent = { event: 'scanStart' };
  mockStdoutResponse(scanStartEvent);
  await backendWaitFor(() =>
    expect(listener1).toHaveBeenCalledWith(scanStartEvent)
  );

  const listener2 = jest.fn();
  client.addListener(listener2);
  const errorEvent: ScannerEvent = {
    event: 'error',
    code: 'other',
    message: 'test error',
  };
  mockStdoutResponse(errorEvent);
  await backendWaitFor(() => {
    expect(listener1).toHaveBeenCalledWith(errorEvent);
    expect(listener2).toHaveBeenCalledWith(errorEvent);
  });

  client.removeListener(listener1);
  mockStdoutResponse(scanStartEvent);
  await backendWaitFor(() => {
    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener1).toHaveBeenLastCalledWith(errorEvent);
    expect(listener2).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenLastCalledWith(scanStartEvent);
  });
});

// Regression test for a bug in which a new listener added by a triggered
// listener would receive the same event that triggered the original listener.
test('listeners can add new listeners that dont receive the same event', async () => {
  const client = createPdiScannerClient();
  const listener2 = jest.fn();
  const listener1 = jest.fn(() => client.addListener(listener2));
  client.addListener(listener1);
  const scanStartEvent: ScannerEvent = { event: 'scanStart' };
  mockStdoutResponse(scanStartEvent);
  await backendWaitFor(() =>
    expect(listener1).toHaveBeenCalledWith(scanStartEvent)
  );
  expect(listener2).not.toHaveBeenCalled();
});

test('converts image data from scanComplete event', async () => {
  const client = createPdiScannerClient();
  const listener = jest.fn();
  client.addListener(listener);
  const imageHeight = 10;
  const rawImageGrayscalePixels = Buffer.from(
    iter([0, 1])
      .cycle()
      .take(SCAN_IMAGE_WIDTH * imageHeight)
      .toArray()
  );
  const scanCompleteEvent: PdictlEvent = {
    event: 'scanComplete',
    imageData: [
      rawImageGrayscalePixels.toString('base64'),
      rawImageGrayscalePixels.toString('base64'),
    ],
  };
  mockStdoutResponse(scanCompleteEvent);
  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledWith({
      event: 'scanComplete',
      images: [
        fromGrayScale(rawImageGrayscalePixels, SCAN_IMAGE_WIDTH, imageHeight),
        fromGrayScale(rawImageGrayscalePixels, SCAN_IMAGE_WIDTH, imageHeight),
      ],
    });
  });
});

test('queues overlapping commands', async () => {
  const client = createPdiScannerClient();
  const command1Promise = client.getScannerStatus();
  const command2Promise = client.enableScanning({
    doubleFeedDetectionEnabled: true,
    paperLengthInches: 11,
  });
  expectStdinCommands([
    { command: 'getScannerStatus' },
    {
      command: 'enableScanning',
      doubleFeedDetectionEnabled: true,
      paperLengthInches: 11,
    },
  ]);
  mockStdoutResponse({ response: 'scannerStatus', status: scannerStatus });
  mockStdoutResponse({ response: 'ok' });
  expect(await command1Promise).toEqual(ok(scannerStatus));
  expect(await command2Promise).toEqual(ok());
});

test('handles unexpected pdictl exit', async () => {
  const client = createPdiScannerClient();
  mockChildProcess.emit('close', 1);
  expect(await client.getScannerStatus()).toEqual(
    err({
      response: 'error',
      code: 'exited',
    })
  );
});

test('getScannerStatus handles error response', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'error', code: 'disconnected' });
  expect(await client.getScannerStatus()).toEqual(
    err({ response: 'error', code: 'disconnected' })
  );
});

test('getScannerStatus handles unexpected response', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.getScannerStatus()).toEqual(
    err({
      code: 'other',
      message: 'Unexpected response: ok',
    })
  );
});

test('simple commands handle unexpected response', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'scannerStatus', status: scannerStatus });
  expect(
    await client.enableScanning({
      doubleFeedDetectionEnabled: true,
      paperLengthInches: 11,
    })
  ).toEqual(
    err({ code: 'other', message: 'Unexpected response: scannerStatus' })
  );
});

test('simple commands handle error response', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'error', code: 'scanInProgress' });
  expect(
    await client.enableScanning({
      doubleFeedDetectionEnabled: true,
      paperLengthInches: 11,
    })
  ).toEqual(err({ response: 'error', code: 'scanInProgress' }));
});
