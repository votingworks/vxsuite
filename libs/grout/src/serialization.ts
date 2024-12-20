import { Buffer } from 'node:buffer';
import {
  assert,
  DateWithoutTime,
  err,
  isResult,
  ok,
  Result,
  isArray,
  isBoolean,
  isFunction,
  isMap,
  isNumber,
  isObject,
  isPlainObject,
  isSet,
  isString,
  assertDefined,
} from '@votingworks/basics';
import { DateTime } from 'luxon';

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

const dateTagger: Tagger<Date, string> = {
  tag: 'Date',
  shouldTag: (value): value is Date =>
    Object.prototype.toString.call(value) === '[object Date]',
  serialize: (value) => value.toISOString(),
  deserialize: (value) => new Date(value),
};

const dateWithoutTimeTagger: Tagger<DateWithoutTime, string> = {
  tag: 'DateWithoutTime',
  shouldTag: (value): value is DateWithoutTime =>
    value instanceof DateWithoutTime,
  serialize: (value) => value.toISOString(),
  deserialize: (value) => new DateWithoutTime(value),
};

const luxonDateTimeTagger: Tagger<DateTime, string> = {
  tag: 'DateTime',
  shouldTag: (value): value is DateTime => value instanceof DateTime,
  serialize: (value) => {
    assert(value.zoneName === 'UTC', 'Only UTC DateTimes are serializable');
    return assertDefined(value.toISO());
  },
  deserialize: (value) => {
    const result = DateTime.fromISO(value, { setZone: true });
    assert(result.zoneName === 'UTC', 'Only UTC DateTimes are deserializable');
    return result;
  },
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
  { isOk: boolean; value: unknown }
> = {
  tag: 'Result',
  shouldTag: isResult,
  serialize: (value) => ({
    isOk: value.isOk(),
    value: value.isOk() ? value.ok() : value.err(),
  }),
  deserialize: (value) => (value.isOk ? ok(value.value) : err(value.value)),
};

const bufferTagger: Tagger<Buffer, string> = {
  tag: 'Buffer',
  shouldTag: (value): value is Buffer => Buffer.isBuffer(value),
  serialize: (value) => value.toString('base64'),
  deserialize: (value) => Buffer.from(value, 'base64'),
};

const uint8ArrayTagger: Tagger<Uint8Array, string> = {
  tag: 'Uint8Array',
  shouldTag: (value): value is Uint8Array => value instanceof Uint8Array,
  serialize: (value) => Buffer.from(value).toString('base64'),
  deserialize: (value) => new Uint8Array(Buffer.from(value, 'base64')),
};

const mapTagger: Tagger<Map<unknown, unknown>, Array<[unknown, unknown]>> = {
  tag: 'Map',
  shouldTag: isMap,
  serialize: (value) => Array.from(value.entries()),
  deserialize: (value) => new Map(value),
};

const setTagger: Tagger<Set<unknown>, unknown[]> = {
  tag: 'Set',
  shouldTag: isSet,
  serialize: (value) => Array.from(value.values()),
  deserialize: (value) => new Set(value),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const taggers: Array<Tagger<any, any>> = [
  undefinedTagger,
  dateTagger,
  dateWithoutTimeTagger,
  luxonDateTimeTagger,
  errorTagger,
  resultTagger,
  bufferTagger,
  uint8ArrayTagger,
  mapTagger,
  setTagger,
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
  if (taggers.some((tagger) => tagger.shouldTag(value))) {
    return;
  }
  if (isObject(value) && isFunction(value['toJSON'])) {
    throw unserializableError(value);
  }
  if (isNumber(value) && (isNaN(value) || !isFinite(value))) {
    throw unserializableError(value);
  }
  if (isJsonBuiltInValueShallow(value)) {
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

  function replacer(
    this: Record<string, unknown>,
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _valueAlreadyStringified: unknown
  ) {
    // The provided value in the JSON.stringify replacer function is already
    // stringified. We want to transform the original unstringified value, which
    // is accessible as `this[key]`.
    const valueUnstringified = this[key];
    throwIfUnserializable(valueUnstringified);
    return tagValueIfNeeded(valueUnstringified);
  }
  return JSON.stringify(rootValue, replacer);
}

/**
 * Deserializes a value that was serialized by `serialize`.
 */
export function deserialize(valueString: string): unknown {
  return JSON.parse(valueString, (_key, value) => untagValueIfNeeded(value));
}
