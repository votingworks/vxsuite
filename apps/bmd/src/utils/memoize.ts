/**
 * Memoizes the result of a function call that is expected to always return the
 * same non-undefined value. Note that this is not the same return value given
 * the arguments, but the same return value _every time_ no matter the
 * arguments. The underlying function will be called until it returns a
 * non-undefined value.
 */
export default function memoize<R, F extends () => R>(fn: F): () => R {
  let returnValue: R

  return () => {
    if (typeof returnValue === 'undefined') {
      returnValue = fn()
    }
    return returnValue
  }
}
