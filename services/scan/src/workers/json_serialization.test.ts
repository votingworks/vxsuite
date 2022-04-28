import { err, isResult, ok } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import * as fc from 'fast-check';
import {
  deserialize,
  serialize,
  SerializedMessage,
} from './json_serialization';

function arbitraryMessage(): fc.Arbitrary<SerializedMessage> {
  const { any } = fc.letrec((tie) => ({
    any: fc.oneof(
      tie('string'),
      tie('number'),
      tie('boolean'),
      tie('null'),
      tie('undefined'),
      tie('object'),
      tie('array'),
      tie('buffer'),
      tie('uint8array')
    ),
    string: fc.string(),
    number: fc.integer(),
    boolean: fc.boolean(),
    null: fc.constant(null),
    undefined: fc.constant(undefined),
    object: fc.object({ values: [tie('any')] }),
    array: fc.array(tie('any')),
    buffer: fc
      .array(fc.integer({ min: 0, max: 255 }))
      .map((arr) => Buffer.from(arr)),
    uint8array: fc
      .array(fc.integer({ min: 0, max: 255 }))
      .map((arr) => Uint8Array.from(arr)),
  }));
  return any as unknown as fc.Arbitrary<SerializedMessage>;
}

test('string', () => {
  fc.assert(
    fc.property(fc.string(), (str) => {
      expect(deserialize(serialize(str))).toEqual(str);
    })
  );
});

test('number', () => {
  fc.assert(
    fc.property(fc.oneof(fc.integer(), fc.float()), (num) => {
      expect(deserialize(serialize(num))).toEqual(num);
    })
  );
});

test('result', () => {
  fc.assert(
    fc.property(
      fc
        .tuple(fc.boolean(), arbitraryMessage())
        .map(([isOk, value]) => (isOk ? ok(value) : err(value))),
      (result) => {
        const roundTripResult = deserialize(serialize(result));
        assert(isResult(roundTripResult));
        expect(roundTripResult.isOk()).toEqual(result.isOk());
        expect(
          roundTripResult.isOk() ? roundTripResult.ok() : roundTripResult.err()
        ).toEqual(result.isOk() ? result.ok() : result.err());
      }
    )
  );
});

test('error', () => {
  fc.assert(
    fc.property(
      fc.string().map((message) => new Error(message)),
      (error) => {
        const roundTripError = deserialize(serialize(error)) as Error;
        expect(roundTripError.message).toEqual(error.message);
        expect(roundTripError.stack).toEqual(error.stack);
      }
    )
  );
});

test('any message', () => {
  fc.assert(
    fc.property(arbitraryMessage(), (msg) => {
      expect(deserialize(serialize(msg))).toEqual(msg);
    })
  );
});
