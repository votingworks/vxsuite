/**
 * Which pieces of hardware support a diagnostics test.
 */
export type DiagnosticType = 'test-print' | 'blank-sheet-scan';

/**
 * The outcome of a hardware diagnostics test.
 */
export type DiagnosticOutcome = 'pass' | 'fail';

/**
 * Record of a hardware diagnostics test.
 */
export interface DiagnosticRecord {
  /**
   * The hardware that was tested.
   */
  type: DiagnosticType;
  /**
   * The outcome of the test, either pass or fail.
   */
  outcome: DiagnosticOutcome;
  /**
   * Timestamp in milliseconds since the Unix epoch.
   */
  timestamp: number;
}
