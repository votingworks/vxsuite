/**
 * Which pieces of hardware support a diagnostics test.
 */
export type DiagnosticType =
  | 'test-print'
  | 'blank-sheet-scan'
  | 'mark-scan-accessible-controller'
  | 'mark-scan-paper-handler'
  | 'mark-scan-pat-input'
  | 'mark-scan-headphone-input'
  | 'scan-audio';

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
   * Details about the outcome of the test.
   */
  message?: string;
  /**
   * Timestamp in milliseconds since the Unix epoch.
   */
  timestamp: number;
}
