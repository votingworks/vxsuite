## TypeScript Best Practices

We follow the
[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
and parts of [Airbnb JavaScript Style Guide](https://airbnb.io/javascript/),
with most of it enforced by ESLint rules. This document covers some of the best
practices that are not automatically enforced by ESLint. We believe our code to
meet all of the recommendations in the Google TypeScript Style Guide published
as of November 21, 2024. A link to the guide as of that date is kept
[here](https://github.com/google/styleguide/blob/4153bf1f8c172fcb58593193238b0a928e58e61e/tsguide.html)
for reference.

A general note about what follows: some of the best practices below are in
service of reducing memory usage and improving the performance of JS code. These
are good things to do and to keep in mind, but [consider using Rust](./rust.md)
for processing "large" amounts of data, even things like single images if you're
processing pixel-by-pixel. It's much faster and more memory-efficient than JS
and is often nicer too.

### Feature Flags

Feature flags are defined in the `libs/utils` project
[here](https://github.com/votingworks/vxsuite/blob/main/libs/utils/src/environment_flag.ts).
To configure which flags you are using you can set them in an `.env.local` file.
This file can live either at the root of vxsuite or in the project you want that
flag to apply to. Flag values set in project files will override those set at
the root. `.env.local` file will also override a default `.env` file at either a
project or root level. To generate a `.env.local` file properly run the
`pnpm configure-dev` command. If you are using VxDev you can run the
`pnpm configure-vxdev-env` command BEFORE running the update code program.

### Use `zod` for validating/parsing JSON data

_(NOTE: Using `zod` has a potentially large performance impact. Measure it if
the data you're working with would be bigger than a few tens of kilobytes.)_

[`zod`](https://github.com/colinhacks/zod) allows you to build a schema that
describes an object's structure:

```ts
import { z } from 'zod/v4';

const Point2dSchema = z.object({
  x: z.number(),
  y: z.number(),
});
```

Schemas can be used to parse incoming JSON data using a helper from
`@votingworks/types`:

```ts
import { safeParseJson } from '@votingworks/types';

const parsed = safeParseJson(input, Point2dSchema);

if (parsed.isOk()) {
  console.log('Got point:', parsed.ok());
} else {
  console.error('Invalid point:', input);
  console.error('Error:', parsed.err());
}
```

> **Note:** If you already have an `unknown` object from JSON, parse it with
> `safeParse` e.g. `safeParse(Point2dSchema, obj)`.

Use `z.infer` to make a TS type for a schema without having to duplicate its
properties.

```ts
import { z } from 'zod/v4';

const Point2dSchema = z.object({
  x: z.number(),
  y: z.number(),
});

interface Point2d extends z.infer<typeof Point2dSchema> {}
```

### Avoid operations that consume a lot of memory

**Example: `fs.readFileSync/fs.readFile`**

These functions read the entire file into memory. If you're reading a file of
unknown size to parse it, consider using `fs.createReadStream` instead. If you
are parsing the file line by line, consider using the `lines` helper from
`@votingworks/basics`:

```ts
import { lines } from '@votingworks/basics';

async function parseFile(path: string) {
  for await (const line of lines(path)) {
    // do something with `line`
  }
}
```

**Example: `JSON.parse` & `JSON.stringify`**

These functions require having both a potentially large string and the
marshalled objects in memory at the same time. For JSON that could be really
large, consider using `.jsonl` (or a non-JSON format) and reading/writing the
file one line at a time with `fs.createReadStream`/`fs.createWriteStream` as
above.

### Don't use unnecessarily slow collection APIs

#### Best practice: favor `Array` over `Iterable` for function parameters

If you're writing a function that takes a collection it should generally be an
array or `Map` or `Set` as appropriate. Consider using the read-only variants of
these types when using them in function parameters to discourage mutating them,
though there are good reasons to mutate arguments sometimes.

Do not use `Iterable` or `AsyncIterable` unless the data is actually lazy,
streamed, or unbounded. This exception is about avoiding excessive memory use.

```ts
// BAD: the generic JS iterable protocol is much slower than arrays
function doSomethingWithIterable(arr: Iterable<number>): void {
  // …
}

// GOOD: this function accepts a read-only array
function doSomethingWithArray(arr: readonly number[]): void {
  // …
}

// GOOD: this function is not well suited to taking an iterable because it
// requires random access. However, it does not require mutability so it can
// take a read-only array. Uses `assertDefined` rather than a cast as a
// defensive move, but only because it's O(1) and doesn't really affect
// performance.
function pickRandom<T>(array: readonly T[]): T {
  return assertDefined(array[Math.floor(Math.random() * array.length)]);
}
```

#### Best practice: pick the right iteration method

There are four main methods of iteration used in vxsuite:

1. JS `for-of` loops. Sometimes fast and efficient for `Array`, but only if V8
   chooses to optimize it.
2. JS collection methods like `.map`/`.filter`/`.reduce`. Ergonomic but so-so on
   speed and memory.
3. JS `for(;;)` loops. Predictably fast and efficient but less ergonomic.
4. `iter` helper in `libs/basics`. Ergonomic and great for async iteration but
   often much slower.

If performance is important, `for(;;)` loops are the most consistently fast. JS
`for-of` loops are typically slower for `Array`, and slower still in the generic
`Iterator` case. JS collection methods like `.map`/`.filter`/`.reduce` are
ergonomic but allocate intermediate arrays in method chains. `iter` can beat JS
collection methods on memory allocation. `iter` also gives an even more
extensive chaining API and works with async iteration, but it uses the JS
iterable APIs and is usually quite slow. Choosing `iter` vs `for await-of` for
async iteration is a matter of taste.

This gap in performance is much more pronounced with typed arrays like
`Uint8Array`. Iterating over them should essentially _always_ be done with
`for(;;)` loops.

```ts
// BAD: iterating over large arrays this way is _very_ slow
iter(cvrs)
  .filter(({ ballotStyleId }) => ballotStyleId === '1')
  .map(({ overvotes }) => overvotes)
  .sum();

// OK: array methods are slower than indexed access but often convenient,
// but this version allocates 2 arrays the length of `cvrs`
cvrs
  .filter(({ ballotStyleId }) => ballotStyleId === '1')
  .map(({ overvotes }) => overvotes)
  .reduce((a, b) => a + b, 0);

// GOOD: use array indexed access; the main downside being the cast
let sum = 0;
for (let i = 0; i < cvrs.length; i += 1) {
  const { ballotStyleId, overvotes } = cvrs[i] as CastVoteRecord;
  if (ballotStyleId === '1') {
    sum += overvotes;
  }
}
```

### Avoid exceptions when possible

If you expect a situation to happen and you expect to handle it specifically,
it's not an exception. Use `Result` from `@votingworks/basics` to represent a
result that could fail. For example, `safeParseJson<T>` returns a
`Result<T, SyntaxError | ZodError>` that represents either a successfully-parsed
object _or_ a parse error of some kind. And (bonus!) the error is typed, whereas
it would not be in a `catch` clause. Here's how to make your own fail-able
function:

```ts
import { err, ok, Result } from '@votingworks/basics';

class DivideByZeroError extends Error {}

function div(
  numerator: number,
  denominator: number
): Result<number, DivideByZeroError> {
  if (denominator === 0) {
    return err(new DivideByZeroError());
  }

  return ok(numerator / denominator);
}

const result = div(a, b);
if (result.isErr()) {
  if (result.err() instanceof DivideByZeroError) {
    console.error('cannot divide by zero!');
  } else {
    console.error('div failed:', a, '/', b, result.err());
  }
} else {
  console.log('div result:', a, '/', b, '=', result.ok());
}
```

### Logging. Do it

Use `@votingworks/logging` to log user actions and important events.

```ts
await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
  disposition: 'success',
  message: `USB drive successfully formatted with a single ${
    fstype === 'ext4' ? 'ext4' : 'FAT32'
  } volume named "${label}".`,
});
```

Note that these logs can be exported by election administrators and viewed, so
we usually don't include _everything_. For debugging at development time, we use
the [`debug`](https://www.npmjs.com/package/debug) package. Note that both
loggers eagerly evaluate their arguments regardless of the current log level
set, so keep the operations to generate the log arguments cheap.
