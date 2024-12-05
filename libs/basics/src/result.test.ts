import { expect, test } from 'vitest';
import { inspect } from 'node:util';
import {
  Result,
  asyncResultBlock,
  err,
  isResult,
  ok,
  resultBlock,
  wrapException,
} from './result';
import { Optional } from './types';
import { assert } from './assert';

test('ok is Ok', () => {
  expect(ok(0).isOk()).toEqual(true);
});

test('ok is not Err', () => {
  expect(ok(0).isErr()).toEqual(false);
});

test('ok has contained value', () => {
  const value: unknown = {};
  expect(ok(value).ok()).toEqual(value);
});

test('ok without contained value', () => {
  expect(ok().ok()).toBeUndefined();
});

test('ok has no contained error', () => {
  expect(ok(0).err()).toBeUndefined();
});

test('ok unsafeUnwrap', () => {
  expect(ok(0).unsafeUnwrap()).toEqual(0);
});

test('ok unsafeUnwrapErr', () => {
  expect(() => ok('value').unsafeUnwrapErr()).toThrowError();
});

test('ok okOrElse', () => {
  expect(ok(0).okOrElse(() => 99)).toEqual(0);
});

test('ok assertOk', () => {
  expect(ok(0).assertOk('a value')).toEqual(0);
});

test('ok assertErr', () => {
  expect(() => ok('value').assertErr('an error')).toThrowError('an error');
});

test('ok is Result', () => {
  expect(isResult(ok())).toEqual(true);
});

test('ok inspect', () => {
  expect(inspect(ok(0))).toEqual('ok(0)');
  expect(
    inspect(
      ok({
        a: { nested: { object: 99 } },
      })
    )
  ).toEqual('ok({ a: { nested: [Object] } })');
  expect(inspect(ok(0), undefined, -1)).toEqual('ok(…)');
});

test('err is Err', () => {
  expect(err(0).isErr()).toEqual(true);
});

test('err is not Ok', () => {
  expect(err(0).isOk()).toEqual(false);
});

test('err has contained error', () => {
  const error: unknown = {};
  expect(err(error).err()).toEqual(error);
});

test('err has no contained value', () => {
  expect(err(0).ok()).toBeUndefined();
});

test('err unsafeUnwrap', () => {
  expect(() => err('error').unsafeUnwrap()).toThrowError();
});

test('err unsafeUnwrapErr', () => {
  expect(err('error').unsafeUnwrapErr()).toEqual('error');
});

test('err okOrElse', () => {
  expect(err('error').okOrElse(() => 0)).toEqual(0);
});

test('err assertOk', () => {
  expect(() => err('error').assertOk('an error!')).toThrowError('an error!');
});

test('err assertErr', () => {
  expect(err('error').assertErr('what?')).toEqual('error');
});

test('err is Result', () => {
  expect(isResult(err(0))).toEqual(true);
});

test('non-ok/non-err are not Result', () => {
  expect(isResult(0)).toEqual(false);
  expect(isResult('')).toEqual(false);
  expect(isResult(undefined)).toEqual(false);
  expect(isResult({})).toEqual(false);
});

test('err inspect', () => {
  expect(inspect(err(0))).toEqual('err(0)');
  expect(
    inspect(
      err({
        a: { nested: { object: 99 } },
      })
    )
  ).toEqual('err({ a: { nested: [Object] } })');
  expect(inspect(err(0), undefined, -1)).toEqual('err(…)');
});

test('wrapException', () => {
  expect(wrapException(new Error('err')).err()).toEqual(new Error('err'));
  expect(wrapException(0).err()).toEqual(new Error('0'));
});

test('resultBlock trivial', () => {
  expect(
    resultBlock(() => {
      // do nothing
    })
  ).toEqual(ok());
});

test('resultBlock ok', () => {
  expect(resultBlock(() => 0)).toEqual(ok(0));
});

test('resultBlock ok result', () => {
  expect(resultBlock(() => ok(0))).toEqual(ok(0));
});

test('resultBlock thrown error', () => {
  expect(() =>
    resultBlock(() => {
      throw new Error('err');
    })
  ).toThrowError('err');
});

test('resultBlock early return', () => {
  expect(
    resultBlock((fail) => {
      err('early return').okOrElse(fail);
    })
  ).toEqual(err('early return'));
});

test('resultBlock complete example', () => {
  function div(numerator: number, denominator: number): Result<number, string> {
    if (denominator === 0) {
      return err('division by zero');
    }

    return ok(numerator / denominator);
  }

  let half: Optional<number>;
  let quarter: Optional<number>;
  let eighth: Optional<number>;

  const result: Result<number, string> = resultBlock((fail) => {
    half = div(1, 2).okOrElse(fail);
    quarter = div(half, 2).okOrElse(fail);
    eighth = div(quarter, 2).okOrElse(fail);

    div(eighth, 0).okOrElse(fail);
    assert(false, 'unreachable');
  });

  expect({ half, quarter, eighth }).toEqual({
    half: 0.5,
    quarter: 0.25,
    eighth: 0.125,
  });
  expect(result).toEqual(err('division by zero'));
});

test('asyncResultBlock trivial', async () => {
  expect(
    await asyncResultBlock(async () => {
      // do nothing
    })
  ).toEqual(ok());
});

test('asyncResultBlock ok', async () => {
  expect(await asyncResultBlock(async () => await Promise.resolve(0))).toEqual(
    ok(0)
  );
});

test('asyncResultBlock ok result', async () => {
  expect(
    await asyncResultBlock(async () => await Promise.resolve(ok(0)))
  ).toEqual(ok(0));
});

test('asyncResultBlock thrown error', async () => {
  await expect(() =>
    asyncResultBlock(() => Promise.reject(new Error('err')))
  ).rejects.toThrowError('err');
});

test('asyncResultBlock early return', async () => {
  expect(
    await asyncResultBlock(async (fail) => {
      err(await Promise.resolve('early return')).okOrElse(fail);
    })
  ).toEqual(err('early return'));
});

test('asyncResultBlock complete example', async () => {
  async function div(
    numerator: number,
    denominator: number
  ): Promise<Result<number, string>> {
    if (denominator === 0) {
      return err('division by zero');
    }

    return await Promise.resolve(ok(numerator / denominator));
  }

  let half: Optional<number>;
  let quarter: Optional<number>;
  let eighth: Optional<number>;

  const result: Result<number, string> = await asyncResultBlock(
    async (fail) => {
      half = (await div(1, 2)).okOrElse(fail);
      quarter = (await div(half, 2)).okOrElse(fail);
      eighth = (await div(quarter, 2)).okOrElse(fail);

      (await div(eighth, 0)).okOrElse(fail);
      assert(false, 'unreachable');
    }
  );

  expect({ half, quarter, eighth }).toEqual({
    half: 0.5,
    quarter: 0.25,
    eighth: 0.125,
  });
  expect(result).toEqual(err('division by zero'));
});
