/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import { DateTime } from 'luxon';
import { deserialize, serialize } from './serialization';

// Note that instead of using a table of test cases, we're using a series of
// assertion functions. This is useful for these tests in particular because
// trying to stringify the value being tested doesn't work in all cases, so
// labeling the test cases with the value being tested is not so useful. This
// way, we get a line number we can check out when an assertion fails.

test('JSON serialization/deserialization', () => {
  function expectToBePreservedExactly(value: any) {
    expect(deserialize(serialize(value))).toStrictEqual(value);
  }

  // Booleans
  expectToBePreservedExactly(true);
  expectToBePreservedExactly(false);
  // Nullish
  expectToBePreservedExactly(null);
  expectToBePreservedExactly(undefined);
  // Numbers
  expectToBePreservedExactly(0);
  expectToBePreservedExactly(1);
  expectToBePreservedExactly(100);
  expectToBePreservedExactly(100_000_000);
  expectToBePreservedExactly(-1);
  // Strings
  expectToBePreservedExactly('');
  expectToBePreservedExactly('some string');
  // Basic objects
  expectToBePreservedExactly({});
  expectToBePreservedExactly({ a: 1 });
  expectToBePreservedExactly({ name: 'John', age: 30, isLoggedIn: false });
  // Basic arrays
  expectToBePreservedExactly([]);
  expectToBePreservedExactly([1, 2, 3]);
  expectToBePreservedExactly([1, true, null, 'a']);
  // Basic maps
  expectToBePreservedExactly(new Map());
  expectToBePreservedExactly(new Map([['a', 1]]));
  expectToBePreservedExactly(
    new Map([
      ['a', 1],
      ['b', 2],
    ])
  );
  expectToBePreservedExactly(new Map([['a', new Map([['b', 2]])]]));
  // Basic sets
  expectToBePreservedExactly(new Set());
  expectToBePreservedExactly(new Set([1]));
  expectToBePreservedExactly(new Set([1, 2]));
  expectToBePreservedExactly(new Set([new Set([1, 2])]));
  // Nested data
  expectToBePreservedExactly({
    name: 'John',
    tags: ['user'],
    children: { name: 'Mary' },
  });
  expectToBePreservedExactly([1, [2, 3], [4, [5, 6]]]);
  expectToBePreservedExactly([{ a: 1 }, { b: [{ c: 2 }] }]);
  // Dates
  expectToBePreservedExactly(new Date('2020-01-01T00:00:00.000Z'));
  expectToBePreservedExactly(new Date());
  expectToBePreservedExactly({ a: new Date() });
  // DateWithoutTimes
  expectToBePreservedExactly(new DateWithoutTime('2020-01-01'));
  expectToBePreservedExactly({ a: new DateWithoutTime('2020-01-01') });
  // luxon DateTimes
  expectToBePreservedExactly(
    DateTime.fromISO('2020-01-01T00:00:00.000Z', { setZone: true })
  );
  expectToBePreservedExactly(DateTime.utc());
  expectToBePreservedExactly({ a: DateTime.utc() });
  // Buffer
  expectToBePreservedExactly(Buffer.from('some string'));
  expectToBePreservedExactly({ a: Buffer.from('some string') });
  expectToBePreservedExactly(Buffer.of(1, 2, 3));
  // Uint8Array
  expectToBePreservedExactly(Uint8Array.from([1, 2, 3]));
  expectToBePreservedExactly({ a: Uint8Array.from([1, 2, 3]) });
  expectToBePreservedExactly(Uint8Array.of(1, 2, 3));
  // Error
  expectToBePreservedExactly(new Error('some error'));
  // Result
  expectToBePreservedExactly(ok());
  expectToBePreservedExactly(ok(undefined));
  expectToBePreservedExactly(ok(1));
  expectToBePreservedExactly(ok({ a: 1 }));
  expectToBePreservedExactly(ok([1, 2, 3]));
  expectToBePreservedExactly(err('some error'));
  expectToBePreservedExactly(err(new Error('some error')));

  function expectToBePreservedSemantically(value: any) {
    expect(deserialize(serialize(value))).toEqual(value);
  }

  // JSON.parse removes undefined values from objects by default. Since
  // that's semantically equivalent in TS, we're fine with that.
  expectToBePreservedSemantically({ a: undefined });
  // Our serialization/deserialization for an array with an undefined value in
  // it puts a hole in the array, which isn't strictly equal but is functionally
  // the same.
  expectToBePreservedSemantically([undefined]);
  expectToBePreservedSemantically([1, undefined, 3]);

  function expectToBeRejected(value: any) {
    expect(() => serialize(value)).toThrow(/Cannot serialize value to JSON/);
  }

  expectToBeRejected(NaN);
  expectToBeRejected(Infinity);
  expectToBeRejected(-Infinity);
  expectToBeRejected(() => 1);
  expectToBeRejected({ method: () => 1 });
  // By default, JSON.stringify will call the toJSON method on objects when
  // serializing, but that's bad for us since we won't know how to deserialize
  // in those cases.
  // eslint-disable-next-line vx/gts-identifiers
  expectToBeRejected({ toJSON: () => 1 });
});

test('deserialize errors with invalid JSON', () => {
  expect(() => deserialize('')).toThrow(SyntaxError);
  expect(() => deserialize('{a}')).toThrow(SyntaxError);
  expect(() =>
    deserialize('{"__grout_type": "not a real type","__grout_value": 1}')
  ).toThrow('Unknown tag: not a real type');
});
