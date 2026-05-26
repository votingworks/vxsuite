/* eslint-disable max-classes-per-file */
import { expect, test, vi } from 'vitest';
import { mockConstructor } from './mock_constructor';

class Original {
  constructor(private readonly value: number) {}
}

class Replacement {
  constructor(private readonly doubled: number) {}
}

test('the wrapped function returns the wrapped value', () => {
  const wrapped = mockConstructor((n: number) => new Replacement(n * 2));
  expect(wrapped(3)).toEqual({ doubled: 6 });
});

test('can be used as a constructor with `new`', () => {
  const Wrapped = mockConstructor(
    (n: number) => new Replacement(n * 2)
  ) as unknown as new (n: number) => Replacement;
  expect(new Wrapped(4)).toEqual({ doubled: 8 });
});

test('plain arrow functions cannot be used as constructors (regression guard)', () => {
  // Intentionally an arrow function — the whole point of the test is that
  // arrow functions have no [[Construct]].
  // eslint-disable-next-line vx/gts-func-style
  const arrow = (_n: number) => new Replacement(0);
  const Arrow = arrow as unknown as new (n: number) => Replacement;
  expect(() => new Arrow(1)).toThrow(TypeError);
});

test('forwards constructor arguments', () => {
  const Wrapped = mockConstructor(
    (...args: number[]) => args
  ) as unknown as new (...args: number[]) => number[];
  expect(new Wrapped(1, 2, 3)).toEqual([1, 2, 3]);
});

test('works with vi.fn for mocking class constructors', () => {
  const replacement = new Replacement(42);
  const Mock = vi.fn(
    mockConstructor((_n: number) => replacement)
  ) as unknown as new (n: number) => Replacement;
  expect(new Mock(7)).toEqual(replacement);
  expect(Mock).toHaveBeenCalledWith(7);
});

test('works with mockImplementation on an existing mock', () => {
  const Target = vi.fn() as unknown as new (n: number) => Original;
  const replacement = new Replacement(0);
  vi.mocked(Target).mockImplementation(
    mockConstructor(() => replacement as unknown as Original)
  );
  expect(new Target(1)).toEqual(replacement);
});
