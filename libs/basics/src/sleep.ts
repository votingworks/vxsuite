/**
 * Returns a promise that resolves after `duration`.
 *
 * @param duration milliseconds to wait
 */
export async function sleep(duration: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
}
