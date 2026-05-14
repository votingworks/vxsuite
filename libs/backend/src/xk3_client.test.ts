import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as nodeHid from 'node-hid';
import {
  HidDeviceInterface,
  HidModuleInterface,
  Xk3Client,
} from './xk3_client';

vi.mock('node-hid', () => ({
  devices: vi.fn(),
  HID: vi.fn(),
}));

const XK3_VID = 0x05f3;
const XK3_PID = 0x04c8;
const PI_CONSUMER_USAGE_PAGE = 0x000c;
const CONNECTION_STATUS_DEBOUNCE_MS = 2000;

function buildReport(switchByte: number): number[] {
  // 36-byte report (hidraw strips Report ID); D1 switch byte at index 2
  const report = Array.from<number>({ length: 36 }).fill(0);
  report[2] = switchByte;
  return report;
}

const JACK_PRESENT_SW_IDLE = buildReport(0x04); // jack=1, SW1=0, SW2=0
// eslint-disable-next-line no-bitwise
const JACK_PRESENT_SW1_ACTIVE = buildReport(0x04 | 0x02); // jack=1, SW1=1
// eslint-disable-next-line no-bitwise
const JACK_PRESENT_SW2_ACTIVE = buildReport(0x04 | 0x01); // jack=1, SW2=1
// eslint-disable-next-line no-bitwise
const JACK_PRESENT_BOTH_ACTIVE = buildReport(0x04 | 0x03); // jack=1, SW1+SW2 (headphones)
const JACK_ABSENT = buildReport(0x00);

function makeDevice(
  reports: Array<number[] | 'timeout' | Error>
): HidDeviceInterface {
  const queue = [...reports];
  return {
    readTimeout: vi.fn(() => {
      const next = queue.shift();
      if (next === undefined) return []; // idle/timeout once queue exhausted
      if (next === 'timeout') return [];
      if (next instanceof Error) throw next;
      return next;
    }),
    write: vi.fn(),
    close: vi.fn(),
  };
}

function makeConnectedHidModule(
  device: HidDeviceInterface
): HidModuleInterface {
  return {
    devices: vi
      .fn()
      .mockReturnValue([
        { path: '/dev/hidraw0', usagePage: PI_CONSUMER_USAGE_PAGE },
      ]),
    openDevice: vi.fn().mockReturnValue(device),
  };
}

// Creates a device whose next report can be changed imperatively between polls.
function makeMutableDevice(initial: number[]): {
  device: HidDeviceInterface;
  setNextReport: (r: number[]) => void;
} {
  let nextReport: number[] = initial;
  const device: HidDeviceInterface = {
    readTimeout: vi.fn(() => {
      const r = nextReport;
      nextReport = [];
      return r;
    }),
    write: vi.fn(),
    close: vi.fn(),
  };
  return {
    device,
    setNextReport: (r) => {
      nextReport = r;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

test('XK-3 not connected returns isPatDeviceConnected false', () => {
  const hidModule: HidModuleInterface = {
    devices: vi.fn().mockReturnValue([]),
    openDevice: vi.fn(),
  };
  const xk3 = new Xk3Client(hidModule);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('devices() is called with correct VID and PID', () => {
  const hidModule: HidModuleInterface = {
    devices: vi.fn().mockReturnValue([]),
    openDevice: vi.fn(),
  };
  void new Xk3Client(hidModule);

  expect(hidModule.devices).toHaveBeenCalledWith(XK3_VID, XK3_PID);
});

test('device with wrong usagePage is not opened', () => {
  const hidModule: HidModuleInterface = {
    devices: vi.fn().mockReturnValue([
      { path: '/dev/hidraw0', usagePage: 0x0001 }, // Keyboard page, not PI Consumer
    ]),
    openDevice: vi.fn(),
  };
  const xk3 = new Xk3Client(hidModule);

  expect(hidModule.openDevice).not.toHaveBeenCalled();
  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('XK-3 connected but nothing in jack (jack=0) returns false', () => {
  const device = makeDevice([JACK_ABSENT]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('headphones (jack=1, SW permanently active) never confirm as PAT device', () => {
  const device = makeDevice([
    JACK_PRESENT_BOTH_ACTIVE,
    JACK_PRESENT_BOTH_ACTIVE,
    JACK_PRESENT_BOTH_ACTIVE,
  ]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS + 1000);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('SW2 active alone also prevents confirmation', () => {
  const device = makeDevice([JACK_PRESENT_SW2_ACTIVE]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.setSystemTime(CONNECTION_STATUS_DEBOUNCE_MS + 1);
  vi.advanceTimersByTime(250);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('PAT device: does not confirm before debounce window', () => {
  const device = makeDevice([JACK_PRESENT_SW_IDLE]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  // Advance to 1999ms — the next interval at 2000ms has not fired yet
  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS - 1);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('PAT device: confirms after debounce window via timeout poll', () => {
  const device = makeDevice([JACK_PRESENT_SW_IDLE]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  // The interval at exactly 2000ms fires a timeout poll; debounce elapses → confirms
  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS);

  expect(xk3.isPatDeviceConnected()).toEqual(true);
});

test('PAT device: confirms after debounce window via idle report', () => {
  // Two consecutive idle reports: first starts the window, second confirms it.
  const device = makeDevice([JACK_PRESENT_SW_IDLE, JACK_PRESENT_SW_IDLE]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.setSystemTime(CONNECTION_STATUS_DEBOUNCE_MS + 1);
  vi.advanceTimersByTime(250); // poll 1: idle report → debounce elapsed → confirms

  expect(xk3.isPatDeviceConnected()).toEqual(true);
});

test('PAT device: second idle report before debounce does not confirm', () => {
  // First idle report at t=0 starts the window; second at t=250 finds elapsed < 2000ms.
  const device = makeDevice([JACK_PRESENT_SW_IDLE, JACK_PRESENT_SW_IDLE]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.advanceTimersByTime(250); // t=250: second idle, elapsed=250 < 2000 → no confirm

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('confirmed PAT device: active switch press does not clear confirmed state', () => {
  const { device, setNextReport } = makeMutableDevice(JACK_PRESENT_SW_IDLE);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS); // confirms at 2000ms

  setNextReport(JACK_PRESENT_SW1_ACTIVE);
  vi.advanceTimersByTime(250); // active switch press — isConfirmed latch holds

  expect(xk3.isPatDeviceConnected()).toEqual(true);
});

test('confirmed PAT device: jack removed resets state', () => {
  const { device, setNextReport } = makeMutableDevice(JACK_PRESENT_SW_IDLE);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS); // confirms

  setNextReport(JACK_ABSENT);
  vi.advanceTimersByTime(250); // jack removed → resets

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('XK-3 USB device disconnects mid-session resets state', () => {
  const device = makeDevice([JACK_PRESENT_SW_IDLE]);
  const hidModule = makeConnectedHidModule(device);
  const xk3 = new Xk3Client(hidModule);

  vi.setSystemTime(CONNECTION_STATUS_DEBOUNCE_MS + 1);
  vi.advanceTimersByTime(250); // confirms via timeout

  // XK-3 USB device disappears from enumeration
  (hidModule.devices as ReturnType<typeof vi.fn>).mockReturnValue([]);
  vi.advanceTimersByTime(250);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('readTimeout error resets state', () => {
  const device = makeDevice([new Error('device disconnected')]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('openDevice error resets state without crash', () => {
  const hidModule: HidModuleInterface = {
    devices: vi
      .fn()
      .mockReturnValue([
        { path: '/dev/hidraw0', usagePage: PI_CONSUMER_USAGE_PAGE },
      ]),
    openDevice: vi.fn().mockImplementation(() => {
      throw new Error('open failed');
    }),
  };
  const xk3 = new Xk3Client(hidModule);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('short report (fewer than 3 bytes) is ignored', () => {
  const device = makeDevice([[0x00, 0x00]]); // only 2 bytes
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('sends Generate Data command after opening device', () => {
  const device = makeDevice([]);
  const hidModule = makeConnectedHidModule(device);
  void new Xk3Client(hidModule);

  expect(device.write).toHaveBeenCalledWith([
    0x00,
    0xb1,
    ...Array.from<number>({ length: 34 }).fill(0),
  ]);
});

test('stable window resets when switches become active before confirmation', () => {
  const device = makeDevice([
    JACK_PRESENT_SW_IDLE, // poll 0: starts stable window at t=0
    JACK_PRESENT_SW1_ACTIVE, // poll 1: SW active → window resets
    JACK_PRESENT_SW_IDLE, // poll 2: starts new stable window
  ]);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.advanceTimersByTime(250); // poll 1: SW active → stableStartTime = null
  vi.advanceTimersByTime(250); // poll 2: idle → stableStartTime = Date.now() = 500

  // Advance to 500 + 1999ms — still before debounce from the reset window
  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS - 1);

  expect(xk3.isPatDeviceConnected()).toEqual(false);
});

test('confirmed PAT device: idle poll after confirmation keeps state', () => {
  const { device } = makeMutableDevice(JACK_PRESENT_SW_IDLE);
  const xk3 = new Xk3Client(makeConnectedHidModule(device));

  vi.advanceTimersByTime(CONNECTION_STATUS_DEBOUNCE_MS); // confirms

  vi.advanceTimersByTime(250); // idle poll while confirmed → stays true

  expect(xk3.isPatDeviceConnected()).toEqual(true);
});

test('default hidModule delegates devices() to nodeHid.devices', () => {
  vi.mocked(nodeHid.devices).mockReturnValue([]);
  void new Xk3Client(); // no hidModule arg → uses defaultHidModule
  expect(nodeHid.devices).toHaveBeenCalledWith(XK3_VID, XK3_PID);
});

test('default hidModule delegates openDevice() to new nodeHid.HID()', () => {
  const mockDevice = makeDevice([]);
  vi.mocked(nodeHid.devices).mockReturnValue([
    { path: '/dev/hidraw0', usagePage: PI_CONSUMER_USAGE_PAGE },
  ] as unknown as nodeHid.Device[]);
  vi.mocked(nodeHid.HID).mockImplementation(
    () => mockDevice as unknown as nodeHid.HID
  );
  void new Xk3Client();
  expect(nodeHid.HID).toHaveBeenCalledWith('/dev/hidraw0');
});
