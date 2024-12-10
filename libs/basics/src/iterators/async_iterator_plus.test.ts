import { expect, test, vi } from 'vitest';
import * as fc from 'fast-check';
import { integers } from './integers';
import { iter } from './iter';
import { naturals } from './naturals';
import { typedAs } from '../typed_as';

test('async', async () => {
  const it = iter([]).async();
  expect(it.async()).toEqual(it);

  // ensure `.async()` transforms `IteratorPlus<Promise<T>>` to `AsyncIteratorPlus<T>`
  expect(
    await typedAs<Promise<number[]>>(
      iter([Promise.resolve(0)])
        .async()
        .toArray()
    )
  ).toEqual([0]);
});

test('map', async () => {
  expect(await iter([]).async().map(Boolean).toArray()).toEqual([]);
  expect(await iter([0, 1, '']).async().map(Boolean).toArray()).toEqual([
    false,
    true,
    false,
  ]);
  expect(
    naturals()
      .take(3)
      .map((n) => n * 2)
      .toArray()
  ).toEqual([2, 4, 6]);
});

test('filter', async () => {
  expect(await iter([]).async().filter(Boolean).toArray()).toEqual([]);
  expect(await iter([0, 1, '']).async().filter(Boolean).toArray()).toEqual([1]);
  expect(
    await iter(naturals())
      .async()
      .take(5)
      .filter((n) => n % 2 === 0)
      .toArray()
  ).toEqual([2, 4]);
  expect(
    await iter(naturals())
      .async()
      .take(5)
      .filter((n) => n % 2)
      .toArray()
  ).toEqual([1, 3, 5]);
});

test('filterMap', async () => {
  expect(await iter([]).async().filterMap(Boolean).toArray()).toEqual([]);
  expect(
    await iter([0, 1, ''])
      .async()
      .filterMap((n) => (typeof n === 'number' ? n * 2 : undefined))
      .toArray()
  ).toEqual([0, 2]);

  const numbersAsWords = ['one', 'two', 'three', 'four', 'five'];
  async function getNumberAsWord(n: number): Promise<string | undefined> {
    return Promise.resolve(numbersAsWords[n - 1]);
  }

  expect(
    await naturals()
      .async()
      .take(5)
      .filterMap(async (n) => (n % 2 === 0 ? getNumberAsWord(n) : undefined))
      .toArray()
  ).toEqual(['two', 'four']);
  expect(
    await naturals()
      .async()
      .take(5)
      .filterMap(async (n) => (n % 2 ? getNumberAsWord(n) : undefined))
      .toArray()
  ).toEqual(['one', 'three', 'five']);
});

test('count', async () => {
  expect(await iter([]).async().count()).toEqual(0);
  expect(await iter([0, 1, '']).async().count()).toEqual(3);
  expect(naturals().take(500).count()).toEqual(500);
  expect(naturals().take(500).skip(499).count()).toEqual(1);
});

test('enumerate', async () => {
  expect(await iter([]).async().enumerate().toArray()).toEqual([]);
  expect(await iter([0, 1, '']).async().enumerate().toArray()).toEqual([
    [0, 0],
    [1, 1],
    [2, ''],
  ]);
  expect(await iter(naturals()).async().take(5).enumerate().toArray()).toEqual([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ]);
});

test('chain', async () => {
  expect(await iter([]).async().chain(iter([]).async()).toArray()).toEqual([]);
  expect(
    await iter([0, 1, '']).async().chain(iter([]).async()).toArray()
  ).toEqual([0, 1, '']);
  expect(
    await iter([])
      .async()
      .chain(iter([0, 1, '']).async())
      .toArray()
  ).toEqual([0, 1, '']);
  expect(
    await iter([0, 1, ''])
      .async()
      .chain(iter([2, 3, 'hi']).async())
      .toArray()
  ).toEqual([0, 1, '', 2, 3, 'hi']);
  expect(naturals().take(5).chain(integers()).take(10).toArray()).toEqual([
    1, 2, 3, 4, 5, 0, 1, 2, 3, 4,
  ]);
});

test('zip', async () => {
  expect(await iter([]).async().zip(iter([])).toArray()).toEqual([]);
  expect(await iter([1]).async().zip().toArray()).toEqual([[1]]);
  expect(
    await iter([1])
      .async()
      .zip(iter([2]))
      .toArray()
  ).toEqual([[1, 2]]);
  expect(
    await iter([1, 2, 3])
      .async()
      .zip(iter([4, 5, 6]).async())
      .toArray()
  ).toEqual([
    [1, 4],
    [2, 5],
    [3, 6],
  ]);

  expect(
    await naturals().async().zip(naturals().async()).take(5).toArray()
  ).toEqual([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ]);
});

test('zip length mismatch', async () => {
  await expect(
    iter([1]).async().zip(iter([]).async()).toArray()
  ).rejects.toThrowError('not all iterables are the same length');
});

test('zipMin', async () => {
  expect(await iter([]).async().zipMin().toArray()).toEqual([]);
  expect(
    await iter([])
      .async()
      .zipMin(iter([1]).async())
      .toArray()
  ).toEqual([]);
  expect(
    await iter([])
      .async()
      .zipMin(iter([1]).async())
      .toArray()
  ).toEqual([]);
  expect(
    await iter([1])
      .async()
      .zipMin(iter([2]).async())
      .toArray()
  ).toEqual([[1, 2]]);
  expect(
    await iter([1, 2])
      .async()
      .zipMin(iter([4, 5, 6]).async())
      .toArray()
  ).toEqual([
    [1, 4],
    [2, 5],
  ]);
  expect(
    await iter([1])
      .async()
      .zipMin(iter([2, 3]).async(), iter([4, 5, 6]).async())
      .toArray()
  ).toEqual([[1, 2, 4]]);

  expect(
    await iter(['a', 'b', 'c'])
      .async()
      .zipMin(iter(naturals()).async())
      .toArray()
  ).toEqual([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);
});

test('chunks without remainder', async () => {
  expect(
    await iter([1, 2, 3, 4, 5, 6, 7, 8, 9]).async().chunks(3).toArray()
  ).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
});

test('chunks with remainder', async () => {
  expect(
    await iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).async().chunks(3).toArray()
  ).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
});

test('chunks invalid group size', () => {
  expect(() =>
    iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).async().chunks(0).toArray()
  ).toThrow();
});

test('chunks with infinite iterator', async () => {
  expect(
    await iter(integers()).async().skip(1).chunks(3).take(5).toArray()
  ).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
    [13, 14, 15],
  ]);
});

test('rev', async () => {
  expect(await iter([]).async().rev().toArray()).toEqual([]);
  expect(await iter([1]).async().rev().toArray()).toEqual([1]);
  expect(await iter([1, 2, 3]).async().rev().toArray()).toEqual([3, 2, 1]);
});

test('take', async () => {
  expect(await iter([]).async().take(0).toArray()).toEqual([]);
  expect(await iter([]).async().take(1).toArray()).toEqual([]);
  expect(await iter(['a', 'b']).async().take(1).toArray()).toEqual(['a']);
  expect(await iter(integers()).async().take(1).toArray()).toEqual([0]);
  expect(await iter(integers()).async().take(5).toArray()).toEqual([
    0, 1, 2, 3, 4,
  ]);
  expect(await iter([]).async().take(-1).toArray()).toEqual([]);

  let count = 0;
  await iter({
    [Symbol.asyncIterator]: () => ({
      next: () => {
        count += 1;
        return Promise.resolve({ value: count, done: false });
      },
    }),
  })
    .take(2)
    .toArray();
  expect(count).toEqual(2);
});

test('skip', async () => {
  expect(await iter(['a', 'b']).async().skip(1).take(1).toArray()).toEqual([
    'b',
  ]);
  expect(await iter(integers()).async().skip(2).take(2).toArray()).toEqual([
    2, 3,
  ]);
  expect(await iter(integers()).async().skip(0).take(2).toArray()).toEqual([
    0, 1,
  ]);
  expect(await iter(integers()).async().skip(-2).take(2).toArray()).toEqual([
    0, 1,
  ]);
  expect(await iter([1]).async().skip(2).take(2).toArray()).toEqual([]);
});

test('toMap empty', async () => {
  expect(
    await iter([])
      .async()
      .toMap(() => 'key')
  ).toEqual(new Map());
});

test('toMap one key', async () => {
  expect(
    await iter([1, 2, 3])
      .async()
      .toMap(() => 'key')
  ).toEqual(new Map([['key', new Set([1, 2, 3])]]));
});

test('toMap identity key', async () => {
  expect(
    await iter([1, 2, 3])
      .async()
      .toMap((a) => a)
  ).toEqual(
    new Map([
      [1, new Set([1])],
      [2, new Set([2])],
      [3, new Set([3])],
    ])
  );
});

test('toMap property', async () => {
  expect(
    await iter([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 1, b: 3 },
    ])
      .async()
      .toMap((item) => item.a)
  ).toEqual(
    new Map([
      [
        1,
        new Set([
          { a: 1, b: 1 },
          { a: 1, b: 3 },
        ]),
      ],
      [2, new Set([{ a: 2, b: 2 }])],
    ])
  );
});

test('toMap from iterable', async () => {
  expect(
    await iter(integers({ from: 1, through: 10 }))
      .async()
      .toMap((a) => a % 2)
  ).toEqual(
    new Map([
      [0, new Set([2, 4, 6, 8, 10])],
      [1, new Set([1, 3, 5, 7, 9])],
    ])
  );
});

test('toSet', async () => {
  expect(await iter([]).async().toSet()).toEqual(new Set());
  expect(await iter([1, 2, 3]).async().toSet()).toEqual(new Set([1, 2, 3]));
});

test('join', async () => {
  expect(await iter([]).async().join()).toEqual('');
  expect(await iter([1, 2, 3]).async().join()).toEqual('123');
  expect(await iter([1, 2, 3]).async().join(' ')).toEqual('1 2 3');
  expect(
    await iter([{ toString: (): string => 'hello' }, 'world'])
      .async()
      .join(', ')
  ).toEqual('hello, world');

  // `toString` is an alias for `join`
  expect(await iter(['a', 'b', 'c']).async().toString()).toEqual('abc');
});

test('first', async () => {
  expect(await iter([]).async().first()).toEqual(undefined);
  expect(await iter([1]).async().first()).toEqual(1);
  expect(await iter([1, 2, 3]).async().first()).toEqual(1);
});

test('flatMap', async () => {
  expect(
    await iter([])
      .async()
      .flatMap(() => [])
      .toArray()
  ).toEqual([]);
  expect(
    await iter([1, 2, 3])
      .async()
      .flatMap((a) => [a, a])
      .toArray()
  ).toEqual([1, 1, 2, 2, 3, 3]);
  expect(
    await iter([1, 2, 3])
      .async()
      .flatMap(async function* double(a) {
        yield await Promise.resolve(a);
        yield a;
      })
      .toArray()
  ).toEqual([1, 1, 2, 2, 3, 3]);
  expect(
    await iter([1, 2, 3])
      .async()
      .flatMap((a) => Promise.resolve([a, a]))
      .toArray()
  ).toEqual([1, 1, 2, 2, 3, 3]);
});

test('groupBy', async () => {
  expect(
    await iter([])
      .async()
      .groupBy(() => true)
      .toArray()
  ).toEqual([]);
  expect(
    await iter([1, 1, 1, 3, 3, 2, 2, 2])
      .async()
      .groupBy((a, b) => Promise.resolve(a === b))
      .toArray()
  ).toEqual([
    [1, 1, 1],
    [3, 3],
    [2, 2, 2],
  ]);
  expect(
    await iter([1, 1, 2, 3, 2, 3, 2, 3, 4])
      .async()
      .groupBy((a, b) => a <= b)
      .toArray()
  ).toEqual([
    [1, 1, 2, 3],
    [2, 3],
    [2, 3, 4],
  ]);

  await fc.assert(
    fc.asyncProperty(
      fc.nat({ max: 100 }).chain((n) =>
        fc.tuple(
          // make `n` values to group
          fc.array(fc.anything(), { minLength: n, maxLength: n }),
          // decide how to group them randomly
          fc.array(fc.boolean(), { minLength: n, maxLength: n })
        )
      ),
      fc.array(fc.integer()),
      async ([values, groupByReturnValues]) => {
        const groups = await iter(values)
          .async()
          .groupBy(() => groupByReturnValues.shift() ?? false)
          .toArray();
        // flattening the groups should give us the original list
        expect(groups.flat()).toEqual(values);
      }
    )
  );
});

test('isEmpty', async () => {
  expect(await iter(null).async().isEmpty()).toEqual(true);
  expect(await iter(undefined).async().isEmpty()).toEqual(true);
  expect(await iter([]).async().isEmpty()).toEqual(true);
  expect(await iter([1]).async().isEmpty()).toEqual(false);
  expect(await iter([1, 2, 3]).async().isEmpty()).toEqual(false);
});

test('last', async () => {
  expect(await iter([]).async().last()).toEqual(undefined);
  expect(await iter([1]).async().last()).toEqual(1);
  expect(await iter([1, 2, 3]).async().last()).toEqual(3);
});

test('find', async () => {
  expect(
    await iter([])
      .async()
      .find(() => true)
  ).toEqual(undefined);
  expect(
    await iter([1])
      .async()
      .find(() => true)
  ).toEqual(1);
  expect(
    await iter([1, 2, 3])
      .async()
      .find((a) => a === 2)
  ).toEqual(2);
  expect(
    await iter([0, 1, 2])
      .async()
      .find((a) => a)
  ).toEqual(1);
});

test('some', async () => {
  expect(
    await iter([])
      .async()
      .some(() => true)
  ).toEqual(false);
  expect(
    await iter([1])
      .async()
      .some(() => true)
  ).toEqual(true);
  expect(
    await iter([1, 2, 3])
      .async()
      .some((a) => a === 2)
  ).toEqual(true);
  expect(
    await iter([0])
      .async()
      .some((a) => a)
  ).toEqual(false);
  expect(
    await iter([1])
      .async()
      .some((a) => a)
  ).toEqual(true);
});

test('every', async () => {
  expect(
    await iter([])
      .async()
      .every(() => true)
  ).toEqual(true);
  expect(
    await iter([1])
      .async()
      .every(() => true)
  ).toEqual(true);
  expect(
    await iter([1, 2, 3])
      .async()
      .every((a) => a === 2)
  ).toEqual(false);
  expect(
    await iter([0, 1, 2])
      .async()
      .every((a) => a)
  ).toEqual(false);
  expect(
    await iter([1, 2, 3])
      .async()
      .every((a) => a)
  ).toEqual(true);
});

test('min', async () => {
  expect(await iter([]).async().min()).toEqual(undefined);
  expect(await iter([1]).async().min()).toEqual(1);
  expect(await iter([1, 1, 1]).async().min()).toEqual(1);
  expect(await iter([1, 2, 3]).async().min()).toEqual(1);
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .min((a, b) => a.t - b.t)
  ).toEqual({ t: 1 });
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .min((a, b) => b.t - a.t)
  ).toEqual({ t: 2 });

  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer(), { minLength: 1 }), async (arr) => {
      expect(await iter(arr).async().min()).toEqual(Math.min(...arr));
    })
  );

  // @ts-expect-error - should be an array of numbers
  await iter(['a']).async().min();
});

test('minBy', async () => {
  expect(
    await iter([])
      .async()
      .minBy(() => 0)
  ).toEqual(undefined);
  expect(
    await iter([1])
      .async()
      .minBy(() => 0)
  ).toEqual(1);
  expect(
    await iter([1, 1, 1])
      .async()
      .minBy(() => 0)
  ).toEqual(1);
  expect(
    await iter([1, 2, 3])
      .async()
      .minBy(() => 0)
  ).toEqual(1);
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .minBy((a) => a.t)
  ).toEqual({ t: 1 });
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .minBy((a) => -a.t)
  ).toEqual({ t: 2 });

  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer(), { minLength: 1 }), async (arr) => {
      expect(
        await iter(arr)
          .async()
          .minBy((a) => a)
      ).toEqual(Math.min(...arr));
    })
  );
});

test('max', async () => {
  expect(await iter([]).async().max()).toEqual(undefined);
  expect(await iter([1]).async().max()).toEqual(1);
  expect(await iter([1, 1, 1]).async().max()).toEqual(1);
  expect(await iter([1, 2, 3]).async().max()).toEqual(3);
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .min((a, b) => a.t - b.t)
  ).toEqual({ t: 1 });
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .min((a, b) => b.t - a.t)
  ).toEqual({ t: 2 });

  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer(), { minLength: 1 }), async (arr) => {
      expect(await iter(arr).async().max()).toEqual(Math.max(...arr));
    })
  );

  // @ts-expect-error - should be an array of numbers
  await iter(['a']).async().max();
});

test('maxBy', async () => {
  expect(
    await iter([])
      .async()
      .maxBy(() => 0)
  ).toEqual(undefined);
  expect(
    await iter([1])
      .async()
      .maxBy(() => 0)
  ).toEqual(1);
  expect(
    await iter([1, 1, 1])
      .async()
      .maxBy(() => 0)
  ).toEqual(1);
  expect(
    await iter([1, 2, 3])
      .async()
      .maxBy((a) => a)
  ).toEqual(3);
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .maxBy((a) => a.t)
  ).toEqual({ t: 2 });
});

test('sum', async () => {
  expect(await iter([]).async().sum()).toEqual(0);
  expect(await iter([1]).async().sum()).toEqual(1);
  expect(await iter([1, 1, 1]).async().sum()).toEqual(3);
  expect(await iter([1, 2, 3]).async().sum()).toEqual(6);
  expect(
    await iter([{ t: 1 }, { t: 2 }])
      .async()
      .sum((a) => a.t)
  ).toEqual(3);

  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer(), { minLength: 1 }), async (arr) => {
      expect(await iter(arr).async().sum()).toEqual(
        arr.reduce((a, b) => a + b)
      );
    })
  );

  // @ts-expect-error - should be an array of numbers
  await iter(['a']).async().sum();
});

test('partition', async () => {
  expect(
    await iter([])
      .async()
      .partition(() => true)
  ).toEqual([[], []]);
  expect(
    await iter([1])
      .async()
      .partition(() => true)
  ).toEqual([[1], []]);
  expect(
    await iter([1, 2, 3])
      .async()
      .partition(() => true)
  ).toEqual([[1, 2, 3], []]);
  expect(
    await iter([1, 2, 3])
      .async()
      .partition((a) => a % 2 === 0)
  ).toEqual([[2], [1, 3]]);
  expect(
    await iter([1, 2, 3])
      .async()
      .partition((a) => a % 2)
  ).toEqual([[1, 3], [2]]);
});

test('windows', async () => {
  expect(() => iter([]).async().windows(0)).toThrowError();
  expect(await iter([]).async().windows(2).toArray()).toEqual([]);
  expect(await iter([1]).async().windows(2).toArray()).toEqual([]);
  expect(await iter([1, 2]).async().windows(2).toArray()).toEqual([[1, 2]]);
  expect(await iter([1, 2, 3]).async().windows(2).toArray()).toEqual([
    [1, 2],
    [2, 3],
  ]);
  expect(await iter([1, 2, 3]).async().windows(3).toArray()).toEqual([
    [1, 2, 3],
  ]);
  expect(await iter([1, 2, 3]).async().windows(4).toArray()).toEqual([]);
  expect(await iter('rust').async().windows(2).toArray()).toEqual([
    ['r', 'u'],
    ['u', 's'],
    ['s', 't'],
  ]);
});

test('reduce', async () => {
  expect(
    await integers()
      .async()
      .take(0)
      .reduce((a, b) => a + b)
  ).toBeUndefined();
  expect(
    await integers()
      .async()
      .take(5)
      .reduce((a, b) => a + b)
  ).toEqual(10);

  const fn1 = vi.fn((a, b) => b);
  await iter(['a', 'b', 'c']).async().reduce(fn1);
  expect(fn1).toHaveBeenCalledTimes(2);
  expect(fn1).toHaveBeenNthCalledWith(1, 'a', 'b', 0);
  expect(fn1).toHaveBeenNthCalledWith(2, 'b', 'c', 1);

  const fn2 = vi.fn((a, b) => b);
  await iter(['a', 'b', 'c']).async().reduce(fn2, 'z');
  expect(fn2).toHaveBeenCalledTimes(3);
  expect(fn2).toHaveBeenNthCalledWith(1, 'z', 'a', 0);
  expect(fn2).toHaveBeenNthCalledWith(2, 'a', 'b', 1);
  expect(fn2).toHaveBeenNthCalledWith(3, 'b', 'c', 2);

  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.anything(), { minLength: 1 }),
      fc.array(fc.anything()),
      fc.boolean(),
      async (arr, init, usePromiseResolve) => {
        expect(
          await iter(arr)
            .async()
            .reduce<unknown[]>(
              (acc, value) =>
                usePromiseResolve
                  ? Promise.resolve([...acc, value])
                  : [...acc, value],
              init
            )
        ).toEqual(arr.reduce<unknown[]>((acc, value) => [...acc, value], init));
      }
    )
  );
});

test('single ownership', async () => {
  const it = iter([1, 2, 3]).async();
  expect(await it.toArray()).toEqual([1, 2, 3]);
  await expect(it.toArray()).rejects.toThrowError(
    'inner iterable has already been taken'
  );
});

test('cycle', async () => {
  expect(await iter([]).async().cycle().take(3).toArray()).toEqual([]);
  expect(await iter([1, 2]).async().cycle().take(3).toArray()).toEqual([
    1, 2, 1,
  ]);
  expect(await iter([1, 2]).async().cycle().take(5).toArray()).toEqual([
    1, 2, 1, 2, 1,
  ]);

  await fc.assert(
    fc.asyncProperty(fc.array(fc.anything()), async (arr) => {
      expect(await iter(arr).async().cycle().take(0).toArray()).toEqual([]);
    })
  );

  await fc.assert(
    fc.asyncProperty(
      fc.record({
        arr: fc.array(fc.anything(), { minLength: 1 }),
        n: fc.integer({ min: 1, max: 100 }),
      }),
      async ({ arr, n }) => {
        expect(await iter(arr).async().cycle().take(n).toArray()).toHaveLength(
          n
        );
      }
    )
  );
});
