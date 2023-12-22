export function collecting<I, T>(
  fn: (input: I) => Iterable<T>
): (input: I) => T[] {
  return (input) => Array.from(fn(input));
}
