import * as nodeHid from 'node-hid';

// Constants and data report structure are documented at:
// P.I. Engineering X-keys XK-3 Switch Interface documentation
// https://github.com/piengineering/PI-Engineering-SDK/blob/9e9747f2631eb9cfff75fd7b22aff9de05e1be28/Documentation/pages/X-keys%20XK-12%20XK-3%20Switch%20Interface%20Data%20Report.htm
const XK3_VID = 0x05f3;
const XK3_PID = 0x04c8;
const PI_CONSUMER_USAGE_PAGE = 0x000c;
// The command to generate the data report that includes jack connection, sip, and puff status
const GENERATE_DATA_CMD = 0xb1;
const GENERATE_DATA_REPORT_BYTES = 35; // 1 command byte + 34 zeros
// The byte index in the returned data report where relevant status bits are located
// This is -1 from the documented byte index because the leading report ID byte from the data report on read
const REPORT_SWITCH_BYTE_INDEX = 2;
// 0b100 indicates 3.5mm plug is inserted in jack
const JACK_DETECT_MASK = 0b100;
// 0b001 and 0b010 indicate sip and puff signals respectively. We want to mask both -> 0b011
const SWITCH_ACTIVE_MASK = 0b011;
const DEFAULT_POLL_INTERVAL_MS = 250;

const READ_TIMEOUT_MS = 50;
const CONNECTION_STATUS_DEBOUNCE_MS = 2000;

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
 * Headphones short SW1/SW2 to ground permanently resulting in consistent high signal
 * on SW1 and SW2 bits in the report.
 * A sip-and-puff PAT device leaves SW1 and SW2 at 0 at rest.
 * isPatDeviceConnected=true only after observing (jack=1, SW=0) for
 * CONNECTION_STATUS_DEBOUNCE_MS and stays true until the plug is removed.
 */
export class Xk3Client {
  private device: HidDeviceInterface | null = null;
  private stableStartTime: number | null = null;
  private patDeviceConnected = false;
  private readonly hidModule: HidModuleInterface;

  constructor(hidModule?: HidModuleInterface) {
    this.hidModule = hidModule ?? defaultHidModule();
    this.poll();
    setInterval(() => this.poll(), DEFAULT_POLL_INTERVAL_MS);
  }

  isPatDeviceConnected(): boolean {
    return this.patDeviceConnected;
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
          ...Array.from<number>({
            length: GENERATE_DATA_REPORT_BYTES - 1,
          }).fill(0),
        ]);
      } catch {
        this.reset();
        return;
      }
    }

    let report: number[];
    try {
      report = this.device.readTimeout(READ_TIMEOUT_MS);
    } catch {
      this.reset();
      return;
    }

    if (report.length === 0) {
      // Timeout — no state change; advance debounce check if in window
      if (this.stableStartTime !== null && !this.patDeviceConnected) {
        if (
          Date.now() - this.stableStartTime >=
          CONNECTION_STATUS_DEBOUNCE_MS
        ) {
          this.patDeviceConnected = true;
        }
      }
      return;
    }

    if (report.length <= REPORT_SWITCH_BYTE_INDEX) {
      return;
    }

    const switchByte = report[REPORT_SWITCH_BYTE_INDEX] ?? 0;
    const jackPresent = Boolean(switchByte & JACK_DETECT_MASK);
    const swActive = Boolean(switchByte & SWITCH_ACTIVE_MASK);

    // Nothing plugged in -> clear state
    if (!jackPresent) {
      this.stableStartTime = null;
      this.patDeviceConnected = false;
    }
    // Something plugged in, but no sip/puff signals active -> could be PAT device
    else if (!swActive) {
      if (this.stableStartTime === null) {
        // First time seeing something plugged in -> start debounce timer
        this.stableStartTime = Date.now();
      }
      // We've seen something plugged in, haven't confirmed it's a PAT device, and debounce
      // time has elapsed without seeing switch activity indicative of headphones
      // -> confirmed PAT device
      else if (
        !this.patDeviceConnected &&
        Date.now() - this.stableStartTime >= CONNECTION_STATUS_DEBOUNCE_MS
      ) {
        this.patDeviceConnected = true;
      }
    } else if (!this.patDeviceConnected) {
      // Headphones case
      this.stableStartTime = null;
    }
    // If isPatDeviceConnected && swActive: confirmed PAT device being triggered — no state change
  }

  private reset(): void {
    this.device?.close();
    this.device = null;
    this.stableStartTime = null;
    this.patDeviceConnected = false;
  }
}
