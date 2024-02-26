/**
 * Which pieces of hardware support a diagnostics test.
 */
export type DiagnosticsHardware = 'printer';

/**
 * The outcome of a hardware diagnostics test.
 */
export type DiagnosticsOutcome = 'pass' | 'fail';

/**
 * Record of a hardware diagnostics test.
 */
export interface DiagnosticsRecord {
  /**
   * The hardware that was tested.
   */
  hardware: DiagnosticsHardware;
  /**
   * The outcome of the test, either pass or fail.
   */
  outcome: DiagnosticsOutcome;
  /**
   * Timestamp in milliseconds since the Unix epoch.
   */
  timestamp: number;
}
