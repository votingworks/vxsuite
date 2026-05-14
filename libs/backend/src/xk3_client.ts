import * as nodeHid from 'node-hid';

const XK3_VID = 0x05f3;
const XK3_PID = 0x04c8;
const PI_CONSUMER_USAGE_PAGE = 0x000c;
const REPORT_SWITCH_BYTE_INDEX = 2;
// 0b100 indicates 3.5mm plug is inserted in jack
const JACK_DETECT_MASK = 0b100;
// 0b001 and 0b010 indicate sip and puff signals respectively. We want to mask both -> 0b011
const SWITCH_ACTIVE_MASK = 0b011;
const DEFAULT_POLL_INTERVAL_MS = 250;
const CONNECTION_STATUS_DEBOUNCE_MS = 2000;

const GENERATE_DATA_CMD = 0xb1;
const GENERATE_DATA_REPORT_BYTES = 35; // 1 command byte + 34 zeros

/** Subset of the node-hid HID device interface used by Xk3Client. */
export interface HidDeviceInterface {
  readTimeout(timeoutMs: number): number[];
  write(data: number[]): number;
  close(): void;
}

/** Subset of the node-hid module interface used by Xk3Client. */
export interface HidModuleInterface {
  devices(
    vid: number,
    pid: number
  ): ReadonlyArray<{ readonly path?: string; readonly usagePage?: number }>;
  openDevice(path: string): HidDeviceInterface;
}

/** Status reported by Xk3Client. */
export interface Xk3ClientStatus {
  isPatDeviceConnected: boolean;
}

function defaultHidModule(): HidModuleInterface {
  return {
    devices(vid, pid) {
      return nodeHid.devices(vid, pid);
    },
    openDevice(path) {
      return new nodeHid.HID(path);
    },
  };
}

/**
 * Monitors the PI Engineering XK-3 Switch Interface (VID 0x05F3, PID 0x04C8)
 * for PAT device presence via the jack-detect bit in the PI Consumer HID report.
 *
 * Headphones short SW1/SW2 to ground permanently, while a sip-and-puff PAT
 * device leaves them at 0 at rest. isPatDeviceConnected=true only after
 * observing (jack=1, SW=0) for CONNECTION_STATUS_DEBOUNCE_MS and stays true
 * until the plug is removed.
 */
export class Xk3Client {
  private device: HidDeviceInterface | null = null;
  private stableStartTime: number | null = null;
  private isPatDeviceConnected = false;
  private readonly hidModule: HidModuleInterface;

  constructor(hidModule?: HidModuleInterface) {
    this.hidModule = hidModule ?? defaultHidModule();
  }

  getStatus(): Xk3ClientStatus {
    return { isPatDeviceConnected: this.isPatDeviceConnected };
  }

  start(): void {
    this.poll();
    setInterval(() => this.poll(), DEFAULT_POLL_INTERVAL_MS);
  }

  private poll(): void {
    const deviceInfo = this.hidModule
      .devices(XK3_VID, XK3_PID)
      .find((d) => d.usagePage === PI_CONSUMER_USAGE_PAGE);

    if (!deviceInfo?.path) {
      this.reset();
      return;
    }

    if (!this.device) {
      try {
        this.device = this.hidModule.openDevice(deviceInfo.path);
        // Query XK-3 for status report
        this.device.write([
          0x00,
          GENERATE_DATA_CMD,
          ...Array.from<number>({ length: GENERATE_DATA_REPORT_BYTES - 1 }).fill(0),
        ]);
      } catch {
        this.reset();
        return;
      }
    }

    let report: number[];
    try {
      report = this.device.readTimeout(50);
    } catch {
      this.reset();
      return;
    }

    if (report.length === 0) {
      // Timeout — no state change; advance debounce check if in window
      if (this.stableStartTime !== null && !this.isPatDeviceConnected) {
        if (
          Date.now() - this.stableStartTime >=
          CONNECTION_STATUS_DEBOUNCE_MS
        ) {
          this.isPatDeviceConnected = true;
        }
      }
      return;
    }

    if (report.length <= REPORT_SWITCH_BYTE_INDEX) {
      return;
    }

    const switchByte = report[REPORT_SWITCH_BYTE_INDEX] ?? 0;
    // eslint-disable-next-line no-bitwise
    const jackPresent = Boolean(switchByte & JACK_DETECT_MASK);
    // eslint-disable-next-line no-bitwise
    const swActive = Boolean(switchByte & SWITCH_ACTIVE_MASK);

    if (!jackPresent) {
      this.stableStartTime = null;
      this.isPatDeviceConnected = false;
    }
    // Only start debounce timer for this module to report PAT device connection
    // if jack is present but switches are inactive.
    // Headphones plugged into the jack will cause the XK-3 to report both sip
    // and puff signals as active.
    else if (!swActive) {
      if (this.stableStartTime === null) {
        this.stableStartTime = Date.now();
      } else if (
        !this.isPatDeviceConnected &&
        Date.now() - this.stableStartTime >= CONNECTION_STATUS_DEBOUNCE_MS
      ) {
        this.isPatDeviceConnected = true;
      }
    } else if (!this.isPatDeviceConnected) {
      // jack present, switches active, not yet confirmed — headphones or errant press
      this.stableStartTime = null;
    }
    // If isPatDeviceConnected && swActive: confirmed PAT device being pressed — no state change
  }

  private reset(): void {
    this.device?.close();
    this.device = null;
    this.stableStartTime = null;
    this.isPatDeviceConnected = false;
  }
}
