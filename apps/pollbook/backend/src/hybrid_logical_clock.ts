export interface HlcTimestamp {
  physical: number; // e.g. Unix time in ms
  logical: number; // increments on ties
  machineId: string; // tie-breaker only used in very unlikely scenarios
}

export class HybridLogicalClock {
  private lastPhysicalTime: number;
  private lastLogical: number;

  constructor(
    private readonly machineId: string,
    initialTime?: number
  ) {
    this.lastPhysicalTime = initialTime || 0;
    this.lastLogical = 0;
  }

  /**
   * Returns the current local HLC as (physical, logical, nodeId).
   */
  now(): HlcTimestamp {
    return {
      physical: this.lastPhysicalTime,
      logical: this.lastLogical,
      machineId: this.machineId,
    };
  }

  /**
   * Generate a new local event HLC timestamp.
   * Usually call this when you create an event locally.
   */
  tick(): HlcTimestamp {
    const nowMs = Date.now();
    // Compare local system time to lastPhysicalTime
    if (nowMs > this.lastPhysicalTime) {
      // Physical clock advanced
      this.lastPhysicalTime = nowMs;
      this.lastLogical = 0;
    } else {
      // Same millisecond or clock went backward: bump logical
      this.lastLogical += 1;
    }
    return this.now();
  }

  /**
   * Update the local HLC state given a remote event's HLC.
   * Returns the merged/updated HLC (your new "now").
   */
  update(remote: HlcTimestamp): HlcTimestamp {
    const localTime = Date.now();

    // 1) Compare local system time to lastPhysicalTime & remote physical
    const newPhysicalTime = Math.max(
      this.lastPhysicalTime,
      remote.physical,
      localTime
    );

    let newLogical = this.lastLogical;

    if (
      newPhysicalTime === this.lastPhysicalTime &&
      newPhysicalTime === remote.physical
    ) {
      // All 3 are equal => increment logical by max of local or remote + 1
      newLogical = Math.max(this.lastLogical, remote.logical) + 1;
    } else if (newPhysicalTime === this.lastPhysicalTime) {
      // Tied with local time but bigger than remote, or vice versa
      newLogical = this.lastLogical + 1;
    } else if (newPhysicalTime === remote.physical) {
      // Tied with remote's physical but bigger than local
      newLogical = remote.logical + 1;
    } else {
      // Physical clock advanced => reset logical
      newLogical = 0;
    }

    this.lastPhysicalTime = newPhysicalTime;
    this.lastLogical = newLogical;

    return this.now();
  }

  /**
   * Returns 1 if a > b, -1 if a < b, 0 if a == b.
   */
  static compareHlcTimestamps(a: HlcTimestamp, b: HlcTimestamp): number {
    if (a.physical < b.physical) {
      return -1;
    }
    if (a.physical > b.physical) {
      return 1;
    }
    if (a.logical < b.logical) {
      return -1;
    }
    if (a.logical > b.logical) {
      return 1;
    }
    return a.machineId.localeCompare(b.machineId);
  }
}
