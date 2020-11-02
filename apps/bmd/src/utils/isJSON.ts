// Ported to TypeScript from:
// https://github.com/joaquimserafim/isJSON

function isString(x: unknown): x is string {
  return Object.prototype.toString.call(x) === '[object String]'
}

function isObject(obj: unknown): obj is object {
  return Object.prototype.toString.call(obj) === '[object Object]'
}

function isJSON(value: unknown, passObject = false): boolean {
  if (passObject && isObject(value)) {
    return true
  }

  if (!isString(value)) {
    return false
  }

  const str = value.replace(/\s/g, '').replace(/\n|\r/, '')

  if (/^\{(.*?)\}$/.test(str)) {
    return /"(.*?)":(.*?)/g.test(str)
  }

  if (/^\[(.*?)\]$/.test(str)) {
    return str
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/},{/g, '}\n{')
      .split(/\n/)
      .every((s) => isJSON(s))
  }

  return false
}

export function isJSONStrict(str: unknown): boolean {
  if (isObject(str)) {
    return true
  } else if (!isString(str)) {
    return false
  }

  try {
    return JSON.parse(str) && true
  } catch (ex) {
    return false
  }
}

export default isJSON
