import * as fc from 'fast-check';
import { typedAs } from '../typed_as';
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

  const numbers = naturals();
  expect(numbers.zip(numbers).take(5).toArray()).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
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

test('toSet', () => {
  expect(iter([]).toSet()).toEqual(new Set());
  expect(iter([1, 2, 3]).toSet()).toEqual(new Set([1, 2, 3]));
});

test('toMap from iterable', () => {
  expect(iter(integers({ from: 1, through: 10 })).toMap((a) => a % 2)).toEqual(
    new Map([
      [0, new Set([2, 4, 6, 8, 10])],
      [1, new Set([1, 3, 5, 7, 9])],
    ])
  );
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

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  typedAs<number | undefined>(iter(['a']).min());
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
