/**
 * Returns boolean when checking if object param is empty.
 */
const isEmptyObject = (obj: Record<PropertyKey, unknown>): boolean => {
  const keys = Object.keys(obj)
  return keys.length === 0
}

export default isEmptyObject
