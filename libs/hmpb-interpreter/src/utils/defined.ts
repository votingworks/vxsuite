export default function defined<T>(value?: T | null): T {
  if (value === null || value === undefined) {
    throw new Error('expected value to be defined');
  }
  return value;
}

export function isDefined<T>(value?: T | null): value is T {
  return value !== null && value !== undefined;
}
