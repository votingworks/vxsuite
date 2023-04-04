import * as fc from 'fast-check';
import { integers } from './integers';
import { iter } from './iter';
import { naturals } from './naturals';

test('async', () => {
  const it = iter([]).async();
  expect(it.async()).toEqual(it);
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

  const numbers = iter(naturals()).async();
  expect(await numbers.zip(numbers).take(5).toArray()).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
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

test('toSet', async () => {
  expect(await iter([]).async().toSet()).toEqual(new Set());
  expect(await iter([1, 2, 3]).async().toSet()).toEqual(new Set([1, 2, 3]));
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
});

test('partition', async () => {
  expect(
    await iter([])
      .async()
      .partition(() => true)
  ).toEqual([new Set(), new Set()]);
  expect(
    await iter([1])
      .async()
      .partition(() => true)
  ).toEqual([new Set([1]), new Set()]);
  expect(
    await iter([1, 2, 3])
      .async()
      .partition(() => true)
  ).toEqual([new Set([1, 2, 3]), new Set()]);
  expect(
    await iter([1, 2, 3])
      .async()
      .partition((a) => a % 2 === 0)
  ).toEqual([new Set([2]), new Set([1, 3])]);
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
