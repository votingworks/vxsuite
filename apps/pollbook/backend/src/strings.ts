/*
 * Pads a number string `n` with 0s up to `targetDigits` inclusive of `n.length`.
 * Returns the original string if `n` is not parsable to an integer or `n.length`
 * exceeds `targetDigits`.
 */
export function padWithZeroes(n: string, targetDigits: number = 2): string {
  if (Number.isNaN(Number.parseInt(n, 10)) || n.length >= targetDigits) {
    return n;
  }

  return `${'0'.repeat(targetDigits - n.length)}${n}`;
}
