/**
 * Returns boolean when checking if object param is empty.
 *
 * @param {object} obj an object with any key/value pairs
 *
 * @return boolean
 *
 */

const isEmptyObject = (obj: object) => {
  const keys = Object.keys(obj)
  return keys && keys.length === 0
}
export default isEmptyObject
