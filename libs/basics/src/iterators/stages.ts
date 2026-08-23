/**
 * A destination for pipeline values. Returns `false` to signal that no further
 * values are wanted, which unwinds the whole pipeline and stops the driver.
 */
export type Sink<T> = (value: T) => boolean;

/**
 * A single element-wise transform in an iterator pipeline, expressed as a
 * function that wraps a downstream {@link Sink} and returns the sink that feeds
 * it. Element types are erased to `unknown` so that a chain of stages with
 * differing element types can be held in one list; each stage restores its own
 * types internally.
 *
 * Expressing transforms this way lets a whole chain run as one flat loop over
 * the source, with no intermediate collections and no per-element generator
 * suspension. Transforms that reorder or regroup elements (`chunks`, `zip`,
 * `cycle`, and friends) are not element-wise and compose as generators instead.
 */
export type Stage = (downstream: Sink<unknown>) => Sink<unknown>;

/**
 * Builds a stage that applies `fn` to each element.
 */
export function mapStage<T, U>(fn: (value: T, index: number) => U): Stage {
  return (downstream) => {
    let index = 0;
    return (value) => {
      const result = fn(value as T, index);
      index += 1;
      return downstream(result);
    };
  };
}

/**
 * Builds a stage that passes through only the elements matching `fn`.
 */
export function filterStage<T>(fn: (value: T) => unknown): Stage {
  return (downstream) => (value) => (fn(value as T) ? downstream(value) : true);
}

/**
 * Builds a stage that applies `fn` to each element and passes through only the
 * non-nullish results.
 */
export function filterMapStage<T, U>(
  fn: (value: T, index: number) => U | null | undefined
): Stage {
  return (downstream) => {
    let index = 0;
    return (value) => {
      const result = fn(value as T, index);
      index += 1;
      return result === null || result === undefined
        ? true
        : downstream(result);
    };
  };
}

/**
 * Builds a stage that replaces each element with the elements of the iterable
 * `fn` returns for it.
 */
export function flatMapStage<T, U>(
  fn: (value: T, index: number) => Iterable<U>
): Stage {
  return (downstream) => {
    let index = 0;
    return (value) => {
      const inner = fn(value as T, index);
      index += 1;
      for (const item of inner) {
        if (!downstream(item)) {
          return false;
        }
      }
      return true;
    };
  };
}

/**
 * Builds a stage that pairs each element with its index.
 */
export function enumerateStage(): Stage {
  return (downstream) => {
    let index = 0;
    return (value) => {
      const result: [number, unknown] = [index, value];
      index += 1;
      return downstream(result);
    };
  };
}

/**
 * Builds a stage that discards the first `count` elements.
 */
export function skipStage(count: number): Stage {
  return (downstream) => {
    let remaining = count;
    return (value) => {
      if (remaining > 0) {
        remaining -= 1;
        return true;
      }
      return downstream(value);
    };
  };
}

/**
 * Builds a stage that passes through at most `count` elements, then stops the
 * pipeline.
 */
export function takeStage(count: number): Stage {
  return (downstream) => {
    let remaining = count;
    return (value) => {
      if (remaining <= 0) {
        return false;
      }
      remaining -= 1;
      return downstream(value) && remaining > 0;
    };
  };
}

/**
 * Composes `stages` into a single sink feeding `destination`. Stages are wrapped
 * from the back so that the returned sink is the head of the pipeline.
 */
function buildSink(
  stages: readonly Stage[],
  destination: Sink<unknown>
): Sink<unknown> {
  let sink = destination;
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    sink = (stages[i] as Stage)(sink);
  }
  return sink;
}

/**
 * Runs `source` through `stages` into `destination` in a single pass, stopping
 * as soon as any sink declines further values.
 */
export function drivePipeline(
  source: Iterable<unknown>,
  stages: readonly Stage[],
  destination: Sink<never>
): void {
  const sink =
    stages.length === 0
      ? (destination as Sink<unknown>)
      : buildSink(stages, destination as Sink<unknown>);
  if (Array.isArray(source)) {
    for (let i = 0; i < source.length; i += 1) {
      if (!sink(source[i])) {
        return;
      }
    }
    return;
  }
  for (const value of source) {
    if (!sink(value)) {
      return;
    }
  }
}

/**
 * Adapts the push-based pipeline to the pull-based iterator protocol by
 * advancing the source one element at a time and holding whatever that element
 * produces until the caller asks for it. Deriving the pull path from the same
 * sinks the push path uses means the two cannot disagree.
 */
function pullPipeline(
  source: Iterable<unknown>,
  stages: readonly Stage[]
): Iterator<unknown> {
  const iterator = source[Symbol.iterator]();
  const pending: unknown[] = [];
  let nextPending = 0;
  let exhausted = false;
  const sink = buildSink(stages, (value) => {
    pending.push(value);
    return true;
  });

  return {
    next(): IteratorResult<unknown> {
      for (;;) {
        if (nextPending < pending.length) {
          const value = pending[nextPending];
          nextPending += 1;
          return { value, done: false };
        }
        if (exhausted) {
          return { value: undefined, done: true };
        }
        pending.length = 0;
        nextPending = 0;
        const next = iterator.next();
        if (next.done) {
          exhausted = true;
        } else if (!sink(next.value)) {
          exhausted = true;
        }
      }
    },
  };
}

/**
 * Composes `source` and `stages` into a lazily-pulled iterable.
 */
export function buildIterable(
  source: Iterable<unknown>,
  stages: readonly Stage[]
): Iterable<unknown> {
  if (stages.length === 0) {
    return source;
  }
  let iterator: Iterator<unknown> | undefined;
  return {
    [Symbol.iterator](): Iterator<unknown> {
      iterator ??= pullPipeline(source, stages);
      return iterator;
    },
  };
}

/**
 * Zips `arrays` positionally without a generator, which is worth a special case
 * because zipping arrays is by far the most common way `zip` is used.
 *
 * The ragged-input check runs when iteration reaches the end of the shortest
 * array rather than up front, so that a mismatch is reported at the same point
 * in the consumer's control flow as it would be when zipping arbitrary
 * iterables.
 */
export function zipArrays(
  arrays: ReadonlyArray<readonly unknown[]>,
  strict: boolean
): Iterable<unknown[]> {
  let shortest = Number.POSITIVE_INFINITY;
  let longest = 0;
  for (const array of arrays) {
    shortest = Math.min(shortest, array.length);
    longest = Math.max(longest, array.length);
  }

  const arity = arrays.length;
  let index = 0;
  const iterator: Iterator<unknown[]> = {
    next(): IteratorResult<unknown[]> {
      if (index >= shortest) {
        if (strict && longest !== shortest) {
          throw new Error('not all iterables are the same length');
        }
        return { value: undefined, done: true };
      }
      const values = Array.of<unknown>();
      for (let i = 0; i < arity; i += 1) {
        values.push((arrays[i] as readonly unknown[])[index]);
      }
      index += 1;
      return { value: values, done: false };
    },
  };

  return { [Symbol.iterator]: () => iterator };
}
