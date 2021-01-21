export type SerializedMessage =
  | string
  | boolean
  | number
  | undefined
  | null
  | SerializedUndefined
  | SerializedArray
  | SerializedObject
  | SerializedBuffer
  | SerializedUint8Array

export interface SerializedUndefined {
  __dataType__: 'undefined'
}

export interface SerializedArray {
  __dataType__: 'Array'
  // TODO: replace `unknown` with `SerializedMessage` after upgrading
  // to TS 4.1+, which has support for circular type references.
  value: Array<unknown>
}

export interface SerializedObject {
  __dataType__: 'Object'
  // TODO: replace `unknown` with `SerializedMessage` after upgrading
  // to TS 4.1+, which has support for circular type references.
  value: Record<string, unknown>
}

export interface SerializedBuffer {
  __dataType__: 'Buffer'
  value: ArrayLike<number>
}

export interface SerializedUint8Array {
  __dataType__: 'Uint8Array'
  value: ArrayLike<number>
}

export function serialize(
  data: unknown,
  keypath: readonly string[] = []
): SerializedMessage {
  switch (typeof data) {
    case 'string':
    case 'number':
    case 'boolean':
      return data

    case 'undefined':
      return { __dataType__: 'undefined' }

    case 'object': {
      if (data === null) {
        return data
      }

      if (Array.isArray(data)) {
        return {
          __dataType__: 'Array',
          value: data.map((element, i) =>
            serialize(element, [...keypath, i.toString()])
          ),
        }
      }

      if (Buffer.isBuffer(data)) {
        return { __dataType__: 'Buffer', value: [...data] }
      }

      if (data instanceof Uint8Array) {
        return { __dataType__: 'Uint8Array', value: [...data] }
      }

      const toStringValue = Object.prototype.toString.call(data)
      if (toStringValue !== '[object Object]') {
        throw new Error(
          `unsupported object type ${toStringValue} at key path '${keypath.join(
            '.'
          )}'`
        )
      }

      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        result[key] = serialize(value, [...keypath, key])
      }
      return { __dataType__: 'Object', value: result }
    }

    default:
      throw new Error(
        `cannot serialize ${typeof data} in message at key path '${keypath.join(
          '.'
        )}'`
      )
  }
}

export function deserialize(
  data: SerializedMessage,
  keypath: readonly string[] = []
): unknown {
  switch (typeof data) {
    case 'string':
    case 'number':
    case 'boolean':
      return data

    case 'object': {
      if (data === null) {
        return data
      }

      if (!('__dataType__' in data)) {
        throw new TypeError(
          `unknown data type at key path ${keypath.join('.')}`
        )
      }

      switch (data.__dataType__) {
        case 'Array':
          return data.value.map((element, i) =>
            deserialize(element as SerializedMessage, [
              ...keypath,
              i.toString(),
            ])
          )

        case 'Object': {
          const result: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(data.value)) {
            result[key] = deserialize(value as SerializedMessage, [
              ...keypath,
              key,
            ])
          }
          return result
        }

        case 'Buffer':
          return Buffer.from(data.value)

        case 'Uint8Array':
          return Uint8Array.from(data.value)

        case 'undefined':
          return undefined

        default:
          throw new Error(
            `unknown serialized data type at key path ${keypath.join('.')}`
          )
      }
    }

    default:
      throw new Error(
        `cannot deserialize ${typeof data} in message at key path '${keypath.join(
          '.'
        )}'`
      )
  }
}
