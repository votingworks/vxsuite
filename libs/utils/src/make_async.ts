export function makeAsync<T extends unknown[], P>(
  fn: (...args: T) => P
): (...args: T) => Promise<P> {
  return (...args: T) => {
    return Promise.resolve(fn(...args));
  };
}
