import { err, isResult, ok } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';

/* eslint-disable no-underscore-dangle */
export type SerializedMessage =
  | string
  | boolean
  | number
  | SerializedNull
  | SerializedUndefined
  | SerializedArray
  | SerializedObject
  | SerializedBuffer
  | SerializedUint8Array
  | SerializedResult
  | SerializedError;

export interface SerializedNull {
  __dataType__: 'null';
}

export interface SerializedUndefined {
  __dataType__: 'undefined';
}

export interface SerializedArray {
  __dataType__: 'Array';
  // TODO: replace `unknown` with `SerializedMessage` after upgrading
  // to TS 4.1+, which has support for circular type references.
  value: unknown[];
}

export interface SerializedObject {
  __dataType__: 'Object';
  // TODO: replace `unknown` with `SerializedMessage` after upgrading
  // to TS 4.1+, which has support for circular type references.
  value: Record<string, unknown>;
}

export interface SerializedBuffer {
  __dataType__: 'Buffer';
  value: ArrayLike<number>;
}

export interface SerializedUint8Array {
  __dataType__: 'Uint8Array';
  value: ArrayLike<number>;
}

export interface SerializedResult {
  __dataType__: 'Result';
  isOk: boolean;
  value: SerializedMessage;
}

export interface SerializedError {
  __dataType__: 'Error';
  message: string;
  stack?: string;
}

export function serialize(
  data: unknown,
  keypath: readonly string[] = []
): SerializedMessage {
  switch (typeof data) {
    case 'string':
    case 'number':
    case 'boolean':
      return data;

    case 'undefined':
      return { __dataType__: 'undefined' };

    case 'object': {
      if (data === null) {
        return { __dataType__: 'null' };
      }

      if (Array.isArray(data)) {
        return {
          __dataType__: 'Array',
          value: data.map((element, i) =>
            serialize(element, [...keypath, i.toString()])
          ),
        };
      }

      if (Buffer.isBuffer(data)) {
        return { __dataType__: 'Buffer', value: [...data] };
      }

      if (data instanceof Uint8Array) {
        return { __dataType__: 'Uint8Array', value: [...data] };
      }

      if (data instanceof Error) {
        return {
          __dataType__: 'Error',
          message: data.message,
          stack: data.stack,
        };
      }

      if (isResult(data)) {
        return {
          __dataType__: 'Result',
          isOk: data.isOk(),
          value: serialize(data.isOk() ? data.ok() : data.err(), [
            ...keypath,
            'value',
          ]),
        };
      }

      const toStringValue = Object.prototype.toString.call(data);
      if (toStringValue !== '[object Object]') {
        throw new Error(
          `unsupported object type ${toStringValue} at key path '${keypath.join(
            '.'
          )}'`
        );
      }

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = serialize(value, [...keypath, key]);
      }
      return { __dataType__: 'Object', value: result };
    }

    default:
      throw new Error(
        `cannot serialize ${typeof data} in message at key path '${keypath.join(
          '.'
        )}'`
      );
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
      return data;

    case 'object': {
      if (data === null) {
        return data;
      }

      if (!('__dataType__' in data)) {
        throw new TypeError(
          `unknown data type at key path ${keypath.join('.')}`
        );
      }

      switch (data.__dataType__) {
        case 'Array':
          return data.value.map((element, i) =>
            deserialize(element as SerializedMessage, [
              ...keypath,
              i.toString(),
            ])
          );

        case 'Object': {
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(data.value)) {
            result[key] = deserialize(value as SerializedMessage, [
              ...keypath,
              key,
            ]);
          }
          return result;
        }

        case 'Buffer':
          return Buffer.from(Array.from(data.value));

        case 'Uint8Array':
          return Uint8Array.from(data.value);

        case 'Error': {
          const error = new Error(data.message);
          error.stack = data.stack;
          return error;
        }

        case 'Result': {
          const value = deserialize(data.value, [...keypath, 'value']);
          return data.isOk ? ok(value) : err(value);
        }

        case 'null':
          return null;

        case 'undefined':
          return undefined;

        default:
          throwIllegalValue(data, '__dataType__');
      }
    }

    // eslint-disable-next-line no-fallthrough
    default:
      throw new Error(
        `cannot deserialize ${typeof data} in message at key path '${keypath.join(
          '.'
        )}'`
      );
  }
}
