import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from './package_root.js';
import {
  type Command,
  type DaemonEvent,
  FRAME_HEADER_LENGTH,
  FrameType,
  type Hello,
  type ResponseBody,
  type ScannedImage,
  decodeEvent,
  decodeFrameHeader,
  decodeHello,
  decodeImage,
  decodeResponse,
  encodeCommand,
  encodeFrame,
} from './protocol.js';

/** Must match `FIXTURE_ID` in the `protocol.rs` tests. */
const FIXTURE_ID = 0x01020304;

type Expected =
  | { readonly command: Command }
  | { readonly response: ResponseBody }
  | { readonly event: DaemonEvent }
  | { readonly hello: Hello }
  | { readonly image: ScannedImage };

/** The values `protocol.rs` encoded into `fixtures/wire.txt`, keyed by fixture name. */
const EXPECTED: Record<string, Expected> = {
  'command.exit': { command: { kind: 'exit' } },
  'command.connect': { command: { kind: 'connect', appId: 'VxCentralScan' } },
  'command.disconnect': { command: { kind: 'disconnect' } },
  'command.getStatus': { command: { kind: 'getStatus' } },
  'command.getVersions': { command: { kind: 'getVersions' } },
  'command.getProfile': { command: { kind: 'getProfile' } },
  'command.setProfile': {
    command: { kind: 'setProfile', profile: 'ProfilePaper_brightness = 200\n' },
  },
  'command.setReady.true': { command: { kind: 'setReady', ready: true } },
  'command.setReady.false': { command: { kind: 'setReady', ready: false } },
  'command.scanStart': { command: { kind: 'scanStart' } },
  'command.scanStop': { command: { kind: 'scanStop' } },
  'command.scanPause': { command: { kind: 'scanPause' } },
  'command.scanResume': { command: { kind: 'scanResume' } },
  'command.setImprinterText': {
    command: { kind: 'setImprinterText', text: 'batch7_%NMC4%%CNT1%' },
  },
  'command.setCounter': {
    command: { kind: 'setCounter', index: 1, value: -9_000_000_000 },
  },
  'command.setNumberOfSheets': {
    command: { kind: 'setNumberOfSheets', count: 25 },
  },
  'response.ok': { response: { kind: 'ok' } },
  'response.error.driverUnavailable': {
    response: {
      kind: 'error',
      code: 'driverUnavailable',
      message: 'no such file',
    },
  },
  'response.error.notConnected': {
    response: { kind: 'error', code: 'notConnected', message: '' },
  },
  'response.error.alreadyConnected': {
    response: { kind: 'error', code: 'alreadyConnected', message: '' },
  },
  'response.error.driver': {
    response: { kind: 'error', code: 'driver', message: 'ScanStart failed' },
  },
  'response.error.badRequest': {
    response: { kind: 'error', code: 'badRequest', message: '' },
  },
  'response.error.other': {
    response: { kind: 'error', code: 'other', message: '…unicode ✓' },
  },
  'response.status': {
    response: {
      kind: 'status',
      status: {
        state: 2,
        operationalState: 1,
        imagesAvailable: 4,
        feederLoaded: 1,
        nextFeederLoaded: 0,
        feederSide: 0,
      },
    },
  },
  'response.versions': {
    response: { kind: 'versions', api: '3.0.0.0', scanner: 'DeskPro 631' },
  },
  'response.profile': { response: { kind: 'profile', profile: '' } },
  'event.log': { event: { kind: 'log', message: 'state scanning' } },
  'event.control': {
    event: {
      kind: 'control',
      controlType: 602,
      numData: 14_900,
      strData: '263',
    },
  },
  'event.disconnected': {
    event: { kind: 'disconnected', message: 'ERR_SCANNER_NOTCONNECTED' },
  },
  'event.incompatibleImage': {
    event: { kind: 'incompatibleImage', size: 30_000 },
  },
  'event.operationalState': { event: { kind: 'operationalState', state: 0 } },
  'event.oversizedImage': {
    event: { kind: 'oversizedImage', seqId: 42, scanSide: 1, size: 70_000_000 },
  },
  hello: { hello: { daemonVersion: '0.1.0' } },
  image: {
    image: {
      header: {
        seqId: 42,
        streamId: 0,
        scanSide: 1,
        resolution: 200,
        pixelsPerLine: 1_700,
        lines: 2_200,
        bytesPerLine: 1_700,
        bitsPerPixel: 8,
        fileFormat: 2,
        compression: 0,
        doubleFeed: 0,
        blankPage: 0,
        integrity: 0,
        counters: [1, 2, 3, 4],
        endorserFrontText: 'batch7_0042',
        endorserBackText: '',
      },
      data: Buffer.of(1, 2, 3),
    },
  },
};

const FIXTURES = new Map(
  readFileSync(join(PACKAGE_ROOT, 'fixtures/wire.txt'), 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [name, hex] = line.split(' ');
      return [name as string, Buffer.from(hex as string, 'hex')];
    })
);

test('every fixture has an expected value and vice versa', () => {
  expect([...FIXTURES.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
});

test.each([...FIXTURES])('%s matches the Rust encoding', (name, frame) => {
  const expected = EXPECTED[name] as Expected;
  const { frameType, length } = decodeFrameHeader(frame);
  const payload = frame.subarray(FRAME_HEADER_LENGTH);
  expect(payload).toHaveLength(length);

  if ('command' in expected) {
    expect(frameType).toEqual(FrameType.Command);
    expect(
      encodeFrame(
        FrameType.Command,
        encodeCommand(FIXTURE_ID, expected.command)
      )
    ).toEqual(frame);
  } else if ('response' in expected) {
    expect(frameType).toEqual(FrameType.Response);
    expect(decodeResponse(payload)).toEqual({
      id: FIXTURE_ID,
      body: expected.response,
    });
  } else if ('event' in expected) {
    expect(frameType).toEqual(FrameType.Event);
    expect(decodeEvent(payload)).toEqual(expected.event);
  } else if ('hello' in expected) {
    expect(frameType).toEqual(FrameType.Hello);
    expect(decodeHello(payload)).toEqual(expected.hello);
  } else {
    expect(frameType).toEqual(FrameType.Image);
    expect(decodeImage(payload)).toEqual(expected.image);
  }
});
