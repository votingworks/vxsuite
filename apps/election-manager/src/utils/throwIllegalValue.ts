export default function throwIllegalValue(s: never): never {
  throw new Error(`Illegal Value: ${s}`)
}
