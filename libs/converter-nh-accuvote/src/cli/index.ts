/**
 * Represents IO for a CLI. Facilitates mocking for testing.
 */
export interface Stdio {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/**
 * The default IO implementation.
 */
export const RealIo: Stdio = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
};
