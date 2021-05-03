export interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

/**
 * Builds a deferred promise that separates the promise itself from the resolve
 * and reject functions, allowing easily passing a promise elsewhere for easy
 * resolution later.
 *
 * @example
 *
 * const { promise, resolve, reject } = deferred<number>()
 * giveThePromiseToSomeone(promise)
 * computeAThingWithACallback((value) => {
 *   if (typeof value === 'number') {
 *     resolve(value)
 *   } else {
 *     reject(new Error('computation failed'))
 *   }
 * })
 */
export default function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
