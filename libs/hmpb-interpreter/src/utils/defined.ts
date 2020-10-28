export default function defined<T>(value: T | undefined | null): T {
  if (value === null || value === undefined) {
    throw new Error('expected value to be defined')
  }
  return value as T
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== null && value !== undefined
}
