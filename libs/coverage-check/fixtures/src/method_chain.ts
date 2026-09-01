// Driver: transformEmpty([]) — no callback ever runs.

// An inline directive on one step of a method chain stays tight. The arrow
// with the directive is excluded; the two without a directive are reported.
export function transformEmpty(items: number[]): number[] {
  return items
    .map((n) => n * 2)
    .filter(/* @coverage-exclude: sentinel filter, driver sends [] */ (n) => n < 0)
    .map((n) => n + 1);
}
