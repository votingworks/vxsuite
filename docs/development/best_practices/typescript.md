## TypeScript Best Practices

We follow the
[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
and parts of [Airbnb JavaScript Style Guide](https://airbnb.io/javascript/),
with most of it enforced by ESLint rules. This document covers some of the best
practices that are not automatically enforced by ESLint. We believe our code to meet all of the recommendations in the Google TypeScript Style Guide published as of April 27, 2023, an archived copy of the guide on that date is kept [here](./04-27-2023-Google-TypeScript-Style-Guide.pdf) for reference. 

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

[`zod`](https://github.com/colinhacks/zod) allows you to build a schema that
describes an object's structure:

```ts
import { z } from 'zod';

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

The type of `parsed.ok()` in the example above will be
`{ x: number; y: number }`. Not bad, but not as descriptive as we'd like. Use
this instead to get a more descriptive name:

```ts
import { z, ZodSchema } from 'zod';

interface Point2d {
  readonly x: number;
  readonly y: number;
}

const Point2dSchema: ZodSchema<Point2d> = z.object({
  x: z.number(),
  y: z.number(),
});
```

Now `parsed.ok()` will have type `Point2d`, which is functionally equivalent but
easier to work with. TypeScript will report an error if the types get out of
sync.

### Use immutability when feasible

**Example: `readonly` interface properties**

If you don't need to be able to assign to a property, make it `readonly`.

```ts
interface Point2d {
  readonly x: number;
  readonly y: number;
}
```

**Example: Use `const` instead of `let` (and never use `var`)**

This should be enforced by eslint when a variable is never reassigned. This
doesn't mean you should _never_ use `let`, just that a `const` version might be
better. If it's better to use `let`, that's fine. There's almost no reason to
use `var`, though.

**Example: Update objects and arrays with rest values**

Rather than assigning to an object property, consider building a new object:

```ts
// NOT PREFERRED: toggle test mode by mutating `settings`
settings.testMode = !settings.testMode;

// PREFERRED: toggle test mode by creating a new object
settings = { ...settings, testMode: !settings.testMode };
```

### Avoid exceptions when possible

If you expect a situation to happen and you expect to handle it specifically,
it's not an exception. Use `Result` from `@votingworks/types` to represent a
result that could fail. For example, `safeParseJson<T>` returns a
`Result<T, SyntaxError | ZodError>` that represents either a successfully-parsed
object _or_ a parse error of some kind. And (bonus!) the error is typed, whereas
it would not be in a `catch` clause. Here's how to make your own fail-able
function:

```ts
import { err, ok, Result } from '@votingworks/types';

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

### Use the `debug` package

In development and production scenarios, debug logs are sometimes the best we
have to figure out what's going wrong. We use the
[`debug`](https://www.npmjs.com/package/debug) package to log interesting events
and data to get a sense of what happened. Use it to tell a story: what happened
and why? Don't just log when things go wrong; log all the time!

#### Naming

Typically you'll name things with two levels of namespace, i.e. `app:scope`.
Sometimes more specificity is needed, i.e. `app:scope-outer:scope-inner`. Here's
an example:

```ts
// libs/math/geometry.ts
import makeDebug from 'debug'

const debug = makeDebug('math:geometry')

export function angleBetweenVectors(v1: Vector, v2: Vector): number {
  debug('computing angle between v1 ({x:%d, y:%d}) & v2 ({x:%d, y:%d})', v1.x, v1.y, v2.x, v2.y)
  const result = …
  debug('computed angle: %d', result)
  return result
}
```

#### Logging in frontends

By default nothing is logged to the terminal. If you run your tests/server/etc
with `DEBUG` set to the right value, you'll get logging. Example:

```sh
# log from the geometry module
DEBUG=math:geometry pnpm start
# log from the whole math library
DEBUG=math:* pnpm start
# log everything
DEBUG=* pnpm start
# log everything except the math library
DEBUG=*,-math:* pnpm start
```

#### Logging in tests

You may want to enable logging even after starting a `test:watch` session. To
log in a single test file, add this above all the other code in the file:

```ts
import { enable } from 'debug';
enable('math:*'); // or whatever globs you want
```
