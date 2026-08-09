import { beforeEach, expect, test, vi } from 'vitest';
import { spawn } from 'node:child_process';
import {
  backendWaitFor,
  mockChildProcess as createMockChildProcess,
  MockChildProcess,
} from '@votingworks/test-utils';
import { err, iter, ok, sleep } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  createPdiScannerClient,
  DoubleFeedDetectionCalibrationConfig,
  SCAN_IMAGE_WIDTH,
  ScannerEvent,
  ScannerStatus,
} from './scanner_client';

vi.mock('node:child_process');
let mockChildProcess: MockChildProcess;

beforeEach(() => {
  mockChildProcess = createMockChildProcess();
  vi.mocked(spawn).mockImplementation(() => mockChildProcess);
});

// The frame layout below intentionally re-states the protocol from main.rs
// rather than reusing scanner_client's internals, so an encode/decode bug
// can't cancel itself out.
const FRAME_TYPE_JSON = 1;
const FRAME_TYPE_SCAN_COMPLETE = 2;
const FRAME_TYPE_LENGTH = 1;
const UINT32_LENGTH = Uint32Array.BYTES_PER_ELEMENT;
const FRAME_HEADER_LENGTH = FRAME_TYPE_LENGTH + UINT32_LENGTH;
const IMAGE_DIMENSIONS_LENGTH = 2 * UINT32_LENGTH;

function frame(frameType: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(FRAME_HEADER_LENGTH);
  header.writeUInt8(frameType, 0);
  header.writeUInt32LE(payload.length, FRAME_TYPE_LENGTH);
  return Buffer.concat([header, payload]);
}

function jsonFrame(message: object): Buffer {
  return frame(FRAME_TYPE_JSON, Buffer.from(JSON.stringify(message), 'utf-8'));
}

function scanCompleteFrame(images: Array<{ width: number; data: Buffer }>) {
  return frame(
    FRAME_TYPE_SCAN_COMPLETE,
    Buffer.concat(
      images.flatMap(({ width, data }) => {
        const dimensions = Buffer.alloc(IMAGE_DIMENSIONS_LENGTH);
        dimensions.writeUInt32LE(width, 0);
        dimensions.writeUInt32LE(data.length / width, UINT32_LENGTH);
        return [dimensions, data];
      })
    )
  );
}

function mockStdoutResponse(response: object): void {
  setTimeout(() => {
    mockChildProcess.stdout.emit('data', jsonFrame(response));
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
    bitonalThreshold: 75,
    doubleFeedDetectionEnabled: true,
    paperLengthInches: 11,
  });
});

test('enableScanning({ bitonalThreshold: 75, doubleFeedDetectionEnabled: false, paperLengthInches: 14 })', async () => {
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
    bitonalThreshold: 75,
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

test('calibrateImageSensors', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.calibrateImageSensors()).toEqual(ok());
  expectStdinCommand({ command: 'calibrateImageSensors' });
});

test('disconnect', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.disconnect()).toEqual(ok());
  expectStdinCommand({ command: 'disconnect' });
});

test('disconnect when already disconnected', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'error', code: 'disconnected' });
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
  const listener1 = vi.fn();
  client.addListener(listener1);
  const scanStartEvent: ScannerEvent = { event: 'scanStart' };
  mockStdoutResponse(scanStartEvent);
  await backendWaitFor(() =>
    expect(listener1).toHaveBeenCalledWith(scanStartEvent)
  );

  const listener2 = vi.fn();
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
  const listener2 = vi.fn();
  const listener1 = vi.fn(() => client.addListener(listener2));
  client.addListener(listener1);
  const scanStartEvent: ScannerEvent = { event: 'scanStart' };
  mockStdoutResponse(scanStartEvent);
  await backendWaitFor(() =>
    expect(listener1).toHaveBeenCalledWith(scanStartEvent)
  );
  expect(listener2).not.toHaveBeenCalled();
});

test('converts image data from scanComplete frame', async () => {
  const client = createPdiScannerClient();
  const listener = vi.fn();
  client.addListener(listener);
  const imageHeight = 10;
  const rawImageGrayscalePixels = Buffer.from(
    iter([0, 1])
      .cycle()
      .take(SCAN_IMAGE_WIDTH * imageHeight)
      .toArray()
  );
  setTimeout(() => {
    mockChildProcess.stdout.emit(
      'data',
      scanCompleteFrame([
        { width: SCAN_IMAGE_WIDTH, data: rawImageGrayscalePixels },
        { width: SCAN_IMAGE_WIDTH, data: rawImageGrayscalePixels },
      ])
    );
  });
  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'scanComplete',
      })
    );
    const call = listener.mock.calls[0] as [
      ScannerEvent & { event: 'scanComplete' },
    ];
    const [front, back] = call[0].images;
    expect(front.width).toEqual(SCAN_IMAGE_WIDTH);
    expect(front.height).toEqual(imageHeight);
    expect(front.data).toEqual(Uint8ClampedArray.from(rawImageGrayscalePixels));
    expect(JSON.stringify(front)).toEqual(
      `"[ImageData ${SCAN_IMAGE_WIDTH}x${imageHeight}]"`
    );
    expect(back.data).toEqual(front.data);
  });
});

test('reassembles frames split across many chunks', async () => {
  const client = createPdiScannerClient();
  const listener = vi.fn();
  client.addListener(listener);

  const imageHeight = 2;
  const topPixels = Buffer.alloc(SCAN_IMAGE_WIDTH * imageHeight, 7);
  const bottomPixels = Buffer.alloc(SCAN_IMAGE_WIDTH * imageHeight, 9);
  const stream = Buffer.concat([
    jsonFrame({ event: 'scanStart' }),
    scanCompleteFrame([
      { width: SCAN_IMAGE_WIDTH, data: topPixels },
      { width: SCAN_IMAGE_WIDTH, data: bottomPixels },
    ]),
    jsonFrame({ event: 'coverOpen' }),
  ]);

  // Deliver the frames in chunks that split both headers and payloads,
  // including a chunk containing the end of one frame and the start of the
  // next.
  setTimeout(() => {
    const chunkSize = 1000;
    for (let offset = 0; offset < stream.length; offset += chunkSize) {
      mockChildProcess.stdout.emit(
        'data',
        stream.subarray(offset, offset + chunkSize)
      );
    }
  });

  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledTimes(3);
  });
  expect(listener).toHaveBeenNthCalledWith(1, { event: 'scanStart' });
  const [scanCompleteEvent] = listener.mock.calls[1] as [
    ScannerEvent & { event: 'scanComplete' },
  ];
  const [top, bottom] = scanCompleteEvent.images;
  expect([top.width, top.height]).toEqual([SCAN_IMAGE_WIDTH, imageHeight]);
  expect(top.data).toEqual(Uint8ClampedArray.from(topPixels));
  expect([bottom.width, bottom.height]).toEqual([
    SCAN_IMAGE_WIDTH,
    imageHeight,
  ]);
  expect(bottom.data).toEqual(Uint8ClampedArray.from(bottomPixels));
  expect(listener).toHaveBeenNthCalledWith(3, { event: 'coverOpen' });
});

test('emits an error and ignores further output on an unknown frame type', async () => {
  const client = createPdiScannerClient();
  const listener = vi.fn();
  client.addListener(listener);

  setTimeout(() => {
    mockChildProcess.stdout.emit('data', frame(255, Buffer.from('garbage')));
  });

  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledWith({
      event: 'error',
      code: 'other',
      message: 'corrupt pdictl output stream: Error: unknown frame type: 255',
    });
  });

  // Frames received after the corrupt frame are not processed
  mockChildProcess.stdout.emit('data', jsonFrame({ event: 'scanStart' }));
  await sleep(0);
  expect(listener).toHaveBeenCalledTimes(1);
});

test('emits an error on a JSON frame that is neither a response nor an event', async () => {
  const client = createPdiScannerClient();
  const listener = vi.fn();
  client.addListener(listener);

  setTimeout(() => {
    mockChildProcess.stdout.emit('data', jsonFrame({ unexpected: true }));
  });

  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledWith({
      event: 'error',
      code: 'other',
      message: expect.stringContaining('corrupt pdictl output stream'),
    });
  });
});

test('emits an error on an implausibly large frame length', async () => {
  const client = createPdiScannerClient();
  const listener = vi.fn();
  client.addListener(listener);

  setTimeout(() => {
    const header = Buffer.alloc(FRAME_HEADER_LENGTH);
    header.writeUInt8(FRAME_TYPE_JSON, 0);
    header.writeUInt32LE(0xffff_ffff, FRAME_TYPE_LENGTH);
    mockChildProcess.stdout.emit('data', header);
  });

  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledWith({
      event: 'error',
      code: 'other',
      message:
        'corrupt pdictl output stream: Error: frame payload too large: 4294967295 bytes',
    });
  });
});

test('emits an error on a scanComplete payload length mismatch', async () => {
  const client = createPdiScannerClient();
  const listener = vi.fn();
  client.addListener(listener);

  setTimeout(() => {
    const validPayload = Buffer.concat([
      scanCompleteFrame([
        { width: 2, data: Buffer.alloc(4) },
        { width: 2, data: Buffer.alloc(4) },
      ]).subarray(5),
      Buffer.from([0]), // extra trailing byte
    ]);
    mockChildProcess.stdout.emit(
      'data',
      frame(FRAME_TYPE_SCAN_COMPLETE, validPayload)
    );
  });

  await backendWaitFor(() => {
    expect(listener).toHaveBeenCalledWith({
      event: 'error',
      code: 'other',
      message: expect.stringContaining('scanComplete payload length mismatch'),
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
      bitonalThreshold: 75,
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

test('reboot', async () => {
  const client = createPdiScannerClient();
  mockStdoutResponse({ response: 'ok' });
  expect(await client.reboot()).toEqual(ok());
  expectStdinCommand({ command: 'reboot' });
});
