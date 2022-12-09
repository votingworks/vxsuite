import { err, isResult, ok, Result } from '@votingworks/types';
import {
  isArray,
  isBoolean,
  isFunction,
  isNumber,
  isObject,
  isPlainObject,
  isString,
} from './util';

type JsonBuiltInValue =
  | null
  | boolean
  | number
  | string
  | JsonBuiltInValue[]
  | { [key: string]: JsonBuiltInValue };

function isJsonBuiltInValueShallow(value: unknown): value is JsonBuiltInValue {
  return (
    value === null ||
    value === undefined ||
    isBoolean(value) ||
    isNumber(value) ||
    isString(value) ||
    isArray(value) ||
    isPlainObject(value)
  );
}

/**
 * To support serializing and deserializing values that are not built into JSON,
 * we transform them into a tagged object. E.g. undefined becomes:
 *
 *  {
 *    __grout_type: 'undefined',
 *    __grout_value: 'undefined'
 *  }
 */
interface TaggedValue {
  __grout_type: string;
  __grout_value: JsonBuiltInValue;
}

function isTaggedValue(value: unknown): value is TaggedValue {
  return isObject(value) && '__grout_type' in value && '__grout_value' in value;
}

/**
 * A Tagger defines how to detect and tag a particular kind of value that we
 * want to define custom tagged serialization for.
 *
 * Grout could potentially be extended to allow custom taggers in the future,
 * but for now we just support a few useful types.
 */
interface Tagger<Value, Serialized> {
  tag: string;
  shouldTag: (value: unknown) => value is Value;
  serialize: (value: Value) => Serialized;
  deserialize: (value: Serialized) => Value;
}

const undefinedTagger: Tagger<undefined, 'undefined'> = {
  tag: 'undefined',
  shouldTag: (value): value is undefined => value === undefined,
  serialize: () => 'undefined',
  deserialize: () => undefined,
};

const errorTagger: Tagger<Error, { message: string }> = {
  tag: 'Error',
  shouldTag: (value): value is Error => value instanceof Error,
  serialize: (value) => ({
    message: value.message,
  }),
  deserialize: (value) => new Error(value.message),
};

const resultTagger: Tagger<
  Result<unknown, unknown>,
  { isOk: boolean; ok: unknown; err: unknown }
> = {
  tag: 'Result',
  shouldTag: isResult,
  serialize: (value) => ({
    isOk: value.isOk(),
    ok: value.ok(),
    err: value.err(),
  }),
  deserialize: (value) => {
    return value.isOk ? ok(value.ok) : err(value.err);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const taggers: Array<Tagger<any, any>> = [
  undefinedTagger,
  errorTagger,
  resultTagger,
];

function tagValueIfNeeded(value: unknown): TaggedValue | unknown {
  const tagger = taggers.find((t) => t.shouldTag(value));
  if (!tagger) return value;
  const taggedValue: TaggedValue = {
    __grout_type: tagger.tag,
    __grout_value: tagger.serialize(value),
  };
  return taggedValue;
}

/* eslint-disable no-underscore-dangle */
function untagValueIfNeeded(value: JsonBuiltInValue): unknown {
  if (!isTaggedValue(value)) return value;
  const tagger = taggers.find((t) => t.tag === value.__grout_type);
  if (tagger) {
    return tagger.deserialize(value.__grout_value);
  }
  throw new Error(`Unknown tag: ${value.__grout_type}`);
}

function unserializableError(value: unknown) {
  return new Error(`Cannot serialize value to JSON: ${JSON.stringify(value)}`);
}

function throwIfUnserializable(value: unknown): void {
  if (isObject(value) && isFunction(value['toJSON'])) {
    throw unserializableError(value);
  }
  if (isNumber(value) && (isNaN(value) || !isFinite(value))) {
    throw unserializableError(value);
  }
  if (isJsonBuiltInValueShallow(value)) {
    return;
  }
  if (taggers.some((tagger) => tagger.shouldTag(value))) {
    return;
  }
  throw unserializableError(value);
}

/**
 * Serializes a value to JSON such that it can be deserialized by `deserialize`.
 * Selected types that are not built into JSON are transformed into tagged
 * objects. Other types that are not built into JSON are not supported and will
 * throw an error.
 */
export function serialize(rootValue: unknown): string {
  throwIfUnserializable(rootValue);
  return JSON.stringify(rootValue, (_key, value) => {
    throwIfUnserializable(value);
    return tagValueIfNeeded(value);
  });
}

/**
 * Deserializes a value that was serialized by `serialize`.
 */
export function deserialize(valueString: string): unknown {
  return JSON.parse(valueString, (_key, value) => untagValueIfNeeded(value));
}
