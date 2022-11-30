/* istanbul ignore file - this file is a demo, and used only in tests */

export const workerPath = __filename;

export type Input = unknown;
export type Output = unknown;

/**
 * Simple worker that simply echoes the input as output.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function call<I extends Input & Output>(input: I): Promise<I> {
  return input;
}
