export function defined<T>(value?: T | null): T {
  if (value === null || value === undefined) {
    throw new Error('expected value to be defined');
  }
  return value;
}
