import { expect, test, vi } from 'vitest';
import * as fc from 'fast-check';
import { integers } from './integers';
import { iter } from './iter';
import { naturals } from './naturals';

test('map', () => {
  expect(iter([]).map(Boolean).toArray()).toEqual([]);
  expect(iter([0, 1, '']).map(Boolean).toArray()).toEqual([false, true, false]);
  expect(
    naturals()
      .take(3)
      .map((n) => n * 2)
      .toArray()
  ).toEqual([2, 4, 6]);
});

test('filter', () => {
  expect(iter([]).filter(Boolean).toArray()).toEqual([]);
  expect(iter([0, 1, '']).filter(Boolean).toArray()).toEqual([1]);
  expect(
    naturals()
      .take(5)
      .filter((n) => n % 2 === 0)
      .toArray()
  ).toEqual([2, 4]);
  expect(
    naturals()
      .take(5)
      .filter((n) => n % 2)
      .toArray()
  ).toEqual([1, 3, 5]);
});

test('filterMap', () => {
  expect(iter([]).filterMap(Boolean).toArray()).toEqual([]);
  expect(
    iter([0, 1, ''])
      .filterMap((n) => (typeof n === 'number' ? n * 2 : undefined))
      .toArray()
  ).toEqual([0, 2]);

  const numbersAsWords = ['one', 'two', 'three', 'four', 'five'];
  function getNumberAsWord(n: number): string | undefined {
    return numbersAsWords[n - 1];
  }

  expect(
    naturals()
      .take(5)
      .filterMap((n) => (n % 2 === 0 ? getNumberAsWord(n) : undefined))
      .toArray()
  ).toEqual(['two', 'four']);
  expect(
    naturals()
      .take(5)
      .filterMap((n) => (n % 2 ? getNumberAsWord(n) : undefined))
      .toArray()
  ).toEqual(['one', 'three', 'five']);
});

test('count', () => {
  expect(iter([]).count()).toEqual(0);
  expect(iter([0, 1, '']).count()).toEqual(3);
  expect(naturals().take(500).count()).toEqual(500);
  expect(naturals().take(500).skip(499).count()).toEqual(1);
});

test('enumerate', () => {
  expect(iter([]).enumerate().toArray()).toEqual([]);
  expect(iter([0, 1, '']).enumerate().toArray()).toEqual([
    [0, 0],
    [1, 1],
    [2, ''],
  ]);
  expect(naturals().take(5).enumerate().toArray()).toEqual([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ]);
});

test('chain', () => {
  expect(iter([]).chain([]).toArray()).toEqual([]);
  expect(iter([0, 1, '']).chain([]).toArray()).toEqual([0, 1, '']);
  expect(iter([]).chain([0, 1, '']).toArray()).toEqual([0, 1, '']);
  expect(iter([0, 1, '']).chain([2, 3, 'hi']).toArray()).toEqual([
    0,
    1,
    '',
    2,
    3,
    'hi',
  ]);
  expect(naturals().take(5).chain(integers()).take(10).toArray()).toEqual([
    1, 2, 3, 4, 5, 0, 1, 2, 3, 4,
  ]);
});

test('zip', () => {
  expect(iter([]).zip([]).toArray()).toEqual([]);
  expect(iter([1]).zip().toArray()).toEqual([[1]]);
  expect(iter([1]).zip([2]).toArray()).toEqual([[1, 2]]);
  expect(iter([1, 2, 3]).zip([4, 5, 6]).toArray()).toEqual([
    [1, 4],
    [2, 5],
    [3, 6],
  ]);

  expect(naturals().zip(naturals()).take(5).toArray()).toEqual([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ]);
});

test('zip length mismatch', () => {
  expect(() => iter([1]).zip([]).toArray()).toThrowError(
    'not all iterables are the same length'
  );
});

test('zipMin', () => {
  expect(iter([]).zipMin().toArray()).toEqual([]);
  expect(iter([]).zipMin([1]).toArray()).toEqual([]);
  expect(iter([]).zipMin([1]).toArray()).toEqual([]);
  expect(iter([1]).zipMin([2]).toArray()).toEqual([[1, 2]]);
  expect(iter([1, 2]).zipMin([4, 5, 6]).toArray()).toEqual([
    [1, 4],
    [2, 5],
  ]);
  expect(iter([1]).zipMin([2, 3], [4, 5, 6]).toArray()).toEqual([[1, 2, 4]]);

  expect(iter(['a', 'b', 'c']).zipMin(naturals()).toArray()).toEqual([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);
});

test('chunks without remainder', () => {
  expect(iter([1, 2, 3, 4, 5, 6, 7, 8, 9]).chunks(3).toArray()).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
});

test('chunks with remainder', () => {
  expect(iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).chunks(3).toArray()).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10],
  ]);
});

test('chunks invalid group size', () => {
  expect(() =>
    iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).chunks(0).toArray()
  ).toThrow();
});

test('chunks with infinite iterator', () => {
  expect(integers().skip(1).chunks(3).take(5).toArray()).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
    [13, 14, 15],
  ]);
});

test('rev', () => {
  expect(iter([]).rev().toArray()).toEqual([]);
  expect(iter([1]).rev().toArray()).toEqual([1]);
  expect(iter([1, 2, 3]).rev().toArray()).toEqual([3, 2, 1]);
});

test('take', () => {
  expect(iter([]).take(0).toArray()).toEqual([]);
  expect(iter([]).take(1).toArray()).toEqual([]);
  expect(iter(['a', 'b']).take(1).toArray()).toEqual(['a']);
  expect(iter(integers()).take(1).toArray()).toEqual([0]);
  expect(iter(integers()).take(5).toArray()).toEqual([0, 1, 2, 3, 4]);
  expect(iter([]).take(-1).toArray()).toEqual([]);

  let count = 0;
  iter({
    [Symbol.iterator]: () => ({
      next: () => {
        count += 1;
        return { value: count, done: false };
      },
    }),
  })
    .take(2)
    .toArray();
  expect(count).toEqual(2);
});

test('skip', () => {
  expect(iter(['a', 'b']).skip(1).take(1).toArray()).toEqual(['b']);
  expect(iter(integers()).skip(2).take(2).toArray()).toEqual([2, 3]);
  expect(iter(integers()).skip(0).take(2).toArray()).toEqual([0, 1]);
  expect(iter(integers()).skip(-2).take(2).toArray()).toEqual([0, 1]);
  expect(iter([1]).skip(2).take(2).toArray()).toEqual([]);
});

test('toMap empty', () => {
  expect(iter([]).toMap(() => 'key')).toEqual(new Map());
});

test('toMap one key', () => {
  expect(iter([1, 2, 3]).toMap(() => 'key')).toEqual(
    new Map([['key', new Set([1, 2, 3])]])
  );
});

test('toMap identity key', () => {
  expect(iter([1, 2, 3]).toMap((a) => a)).toEqual(
    new Map([
      [1, new Set([1])],
      [2, new Set([2])],
      [3, new Set([3])],
    ])
  );
});

test('toMap property', () => {
  expect(
    iter([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 1, b: 3 },
    ]).toMap((item) => item.a)
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

test('toMap from iterable', () => {
  expect(iter(integers({ from: 1, through: 10 })).toMap((a) => a % 2)).toEqual(
    new Map([
      [0, new Set([2, 4, 6, 8, 10])],
      [1, new Set([1, 3, 5, 7, 9])],
    ])
  );
});

test('toSet', () => {
  expect(iter([]).toSet()).toEqual(new Set());
  expect(iter([1, 2, 3]).toSet()).toEqual(new Set([1, 2, 3]));
});

test('join', () => {
  expect(iter([]).join()).toEqual('');
  expect(iter([1, 2, 3]).join()).toEqual('123');
  expect(iter([1, 2, 3]).join(' ')).toEqual('1 2 3');
  expect(
    iter([{ toString: (): string => 'hello' }, 'world']).join(', ')
  ).toEqual('hello, world');

  // `toString` is an alias for `join`
  expect(iter(['a', 'b', 'c']).toString()).toEqual('abc');
});

test('first', () => {
  expect(iter([]).first()).toEqual(undefined);
  expect(iter([1]).first()).toEqual(1);
  expect(iter([1, 2, 3]).first()).toEqual(1);
});

test('flatMap', () => {
  expect(
    iter([])
      .flatMap(() => [])
      .toArray()
  ).toEqual([]);
  expect(
    iter([1, 2, 3])
      .flatMap((a) => [a, a])
      .toArray()
  ).toEqual([1, 1, 2, 2, 3, 3]);
  expect(
    iter([1, 2, 3])
      .flatMap(function* double(a) {
        yield a;
        yield a;
      })
      .toArray()
  ).toEqual([1, 1, 2, 2, 3, 3]);
});

test('groupBy', () => {
  expect(
    iter([])
      .groupBy(() => true)
      .toArray()
  ).toEqual([]);
  expect(
    iter([1, 1, 1, 3, 3, 2, 2, 2])
      .groupBy((a, b) => a === b)
      .toArray()
  ).toEqual([
    [1, 1, 1],
    [3, 3],
    [2, 2, 2],
  ]);
  expect(
    iter([1, 1, 2, 3, 2, 3, 2, 3, 4])
      .groupBy((a, b) => a <= b)
      .toArray()
  ).toEqual([
    [1, 1, 2, 3],
    [2, 3],
    [2, 3, 4],
  ]);

  fc.assert(
    fc.property(
      fc.nat({ max: 100 }).chain((n) =>
        fc.tuple(
          // make `n` values to group
          fc.array(fc.anything(), { minLength: n, maxLength: n }),
          // decide how to group them randomly
          fc.array(fc.boolean(), { minLength: n, maxLength: n })
        )
      ),
      fc.array(fc.integer()),
      ([values, groupByReturnValues]) => {
        const groups = iter(values)
          .groupBy(() => groupByReturnValues.shift() ?? false)
          .toArray();
        // flattening the groups should give us the original list
        expect(groups.flat()).toEqual(values);
      }
    )
  );
});

test('isEmpty', () => {
  expect(iter(null).isEmpty()).toEqual(true);
  expect(iter(undefined).isEmpty()).toEqual(true);
  expect(iter([]).isEmpty()).toEqual(true);
  expect(iter([1]).isEmpty()).toEqual(false);
  expect(iter([1, 2, 3]).isEmpty()).toEqual(false);
});

test('last', () => {
  expect(iter([]).last()).toEqual(undefined);
  expect(iter([1]).last()).toEqual(1);
  expect(iter([1, 2, 3]).last()).toEqual(3);
});

test('find', () => {
  expect(iter([]).find(() => true)).toEqual(undefined);
  expect(iter([1]).find(() => true)).toEqual(1);
  expect(iter([1, 2, 3]).find((a) => a === 2)).toEqual(2);
  expect(iter([0, 1, 2]).find((a) => a)).toEqual(1);
});

test('some', () => {
  expect(iter([]).some(() => true)).toEqual(false);
  expect(iter([1]).some(() => true)).toEqual(true);
  expect(iter([1, 2, 3]).some((a) => a === 2)).toEqual(true);
  expect(iter([0]).some((a) => a)).toEqual(false);
  expect(iter([1]).some((a) => a)).toEqual(true);
});

test('every', () => {
  expect(iter([]).every(() => true)).toEqual(true);
  expect(iter([1]).every(() => true)).toEqual(true);
  expect(iter([1, 2, 3]).every((a) => a === 2)).toEqual(false);
  expect(iter([0, 1, 2]).every((a) => a)).toEqual(false);
  expect(iter([1, 2, 3]).every((a) => a)).toEqual(true);
});

test('min', () => {
  expect(iter([]).min()).toEqual(undefined);
  expect(iter([1]).min()).toEqual(1);
  expect(iter([1, 1, 1]).min()).toEqual(1);
  expect(iter([1, 2, 3]).min()).toEqual(1);
  expect(iter([{ t: 1 }, { t: 2 }]).min((a, b) => a.t - b.t)).toEqual({ t: 1 });
  expect(iter([{ t: 1 }, { t: 2 }]).min((a, b) => b.t - a.t)).toEqual({ t: 2 });

  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 1 }), (arr) => {
      expect(iter(arr).min()).toEqual(Math.min(...arr));
    })
  );

  // @ts-expect-error - should be an array of numbers
  iter(['a']).min();
});

test('minBy', () => {
  expect(iter([]).minBy(() => 0)).toEqual(undefined);
  expect(iter([1]).minBy(() => 0)).toEqual(1);
  expect(iter([1, 1, 1]).minBy(() => 0)).toEqual(1);
  expect(iter([1, 2, 3]).minBy((a) => a)).toEqual(1);
  expect(iter([{ t: 1 }, { t: 2 }]).minBy((a) => a.t)).toEqual({ t: 1 });
});

test('max', () => {
  expect(iter([]).max()).toEqual(undefined);
  expect(iter([1]).max()).toEqual(1);
  expect(iter([1, 1, 1]).max()).toEqual(1);
  expect(iter([1, 2, 3]).max()).toEqual(3);
  expect(iter([1, 2, 3]).max()).toEqual(3);
  expect(iter([{ t: 1 }, { t: 2 }]).max((a, b) => a.t - b.t)).toEqual({ t: 2 });
  expect(iter([{ t: 1 }, { t: 2 }]).max((a, b) => b.t - a.t)).toEqual({ t: 1 });

  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 1 }), (arr) => {
      expect(iter(arr).max()).toEqual(Math.max(...arr));
    })
  );

  // @ts-expect-error - should be an array of numbers
  iter(['a']).max();
});

test('maxBy', () => {
  expect(iter([]).maxBy(() => 0)).toEqual(undefined);
  expect(iter([1]).maxBy(() => 0)).toEqual(1);
  expect(iter([1, 1, 1]).maxBy(() => 0)).toEqual(1);
  expect(iter([1, 2, 3]).maxBy((a) => a)).toEqual(3);
  expect(iter([{ t: 1 }, { t: 2 }]).maxBy((a) => a.t)).toEqual({ t: 2 });
});

test('sum', () => {
  expect(iter([]).sum()).toEqual(0);
  expect(iter([1]).sum()).toEqual(1);
  expect(iter([1, 2, 3]).sum()).toEqual(6);
  expect(iter([1, 2, 3]).sum()).toEqual(6);
  expect(iter([{ t: 1 }, { t: 2 }]).sum((a) => a.t)).toEqual(3);

  fc.assert(
    fc.property(fc.array(fc.integer(), { minLength: 1 }), (arr) => {
      expect(iter(arr).sum()).toEqual(arr.reduce((a, b) => a + b));
    })
  );

  // @ts-expect-error - should be an array of numbers
  iter(['a']).sum();
});

test('partition', () => {
  expect(iter([]).partition(() => true)).toEqual([[], []]);
  expect(iter([1]).partition(() => true)).toEqual([[1], []]);
  expect(iter([1, 2, 3]).partition(() => true)).toEqual([[1, 2, 3], []]);
  expect(iter([1, 2, 3]).partition((a) => a % 2 === 0)).toEqual([[2], [1, 3]]);
  expect(iter([1, 2, 3]).partition((a) => a % 2)).toEqual([[1, 3], [2]]);
});

test('windows', () => {
  expect(() => iter([]).windows(0)).toThrowError();
  expect(iter([]).windows(2).toArray()).toEqual([]);
  expect(iter([1]).windows(2).toArray()).toEqual([]);
  expect(iter([1, 2]).windows(2).toArray()).toEqual([[1, 2]]);
  expect(iter([1, 2, 3]).windows(2).toArray()).toEqual([
    [1, 2],
    [2, 3],
  ]);
  expect(iter([1, 2, 3]).windows(3).toArray()).toEqual([[1, 2, 3]]);
  expect(iter([1, 2, 3]).windows(4).toArray()).toEqual([]);
  expect(iter('rust').windows(2).toArray()).toEqual([
    ['r', 'u'],
    ['u', 's'],
    ['s', 't'],
  ]);
});

test('reduce', () => {
  expect(
    integers()
      .take(0)
      .reduce((a, b) => a + b)
  ).toBeUndefined();
  expect(
    integers()
      .take(5)
      .reduce((a, b) => a + b)
  ).toEqual(10);

  const fn1 = vi.fn((a, b) => b);
  iter(['a', 'b', 'c']).reduce(fn1);
  expect(fn1).toHaveBeenCalledTimes(2);
  expect(fn1).toHaveBeenNthCalledWith(1, 'a', 'b', 0);
  expect(fn1).toHaveBeenNthCalledWith(2, 'b', 'c', 1);

  const fn2 = vi.fn((a, b) => b);
  iter(['a', 'b', 'c']).reduce(fn2, 'z');
  expect(fn2).toHaveBeenCalledTimes(3);
  expect(fn2).toHaveBeenNthCalledWith(1, 'z', 'a', 0);
  expect(fn2).toHaveBeenNthCalledWith(2, 'a', 'b', 1);
  expect(fn2).toHaveBeenNthCalledWith(3, 'b', 'c', 2);

  fc.assert(
    fc.property(
      fc.array(fc.anything(), { minLength: 1 }),
      fc.array(fc.anything()),
      (arr, init) => {
        expect(
          iter(arr).reduce<unknown[]>((acc, value) => [...acc, value], init)
        ).toEqual(arr.reduce<unknown[]>((acc, value) => [...acc, value], init));
      }
    )
  );
});

test('single ownership', () => {
  const it = iter([1, 2, 3]);
  expect(it.toArray()).toEqual([1, 2, 3]);
  expect(() => it.toArray()).toThrowError(
    'inner iterable has already been taken'
  );
});

test('cycle', () => {
  expect(iter([]).cycle().take(5).toArray()).toEqual([]);
  expect(iter([1]).cycle().take(5).toArray()).toEqual([1, 1, 1, 1, 1]);
  expect(iter([1, 2, 3]).cycle().take(5).toArray()).toEqual([1, 2, 3, 1, 2]);

  fc.assert(
    fc.property(fc.array(fc.anything()), (arr) => {
      expect(iter(arr).cycle().take(0).toArray()).toEqual([]);
    })
  );

  fc.assert(
    fc.property(
      fc.record({
        arr: fc.array(fc.anything(), { minLength: 1 }),
        n: fc.integer({ min: 1, max: 100 }),
      }),
      ({ arr, n }) => {
        expect(iter(arr).cycle().take(n).toArray()).toHaveLength(n);
      }
    )
  );
});
