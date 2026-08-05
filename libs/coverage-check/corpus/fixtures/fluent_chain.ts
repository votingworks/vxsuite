// Driver: transformEmpty([]) — no callback ever runs.
// Locks: inline flag on one step of a fluent chain stays tight: the two
// unflagged arrows FAIL, the flagged one is excluded.

export function transformEmpty(items: number[]): number[] {
  return items
    .map((n) => n * 2)
    .filter(/* @coverage-exclude: sentinel filter, driver sends [] */ (n) => n < 0)
    .map((n) => n + 1);
}
