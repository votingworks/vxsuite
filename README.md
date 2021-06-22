# vxsuite

The VotingWorks in-person voting system.

## About

Includes software for a [ballot-marking device (BMD)](./apps/bmd), a
[ballot activation system (BAS)](./apps/bas), a
[ballot scanning device (BSD)](./apps/bsd), and an
[election manager](./apps/election-manager). See https://voting.works for more
information about VotingWorks.

## Development

Building VxSuite for development requires git, [NodeJS](https://nodejs.org/)
v12.19.0 and [pnpm](https://pnpm.js.org).

### Ubuntu Quickstart

This expects Ubuntu 18.0.4, though it may work on other versions. This installs
the right version of NodeJS manually. You can use a tool like
[nvm](https://github.com/nvm-sh/nvm) or [volta](https://volta.sh) to do this in
a nicer way.

```sh
# change this to wherever you want:
NODE_ROOT="${HOME}/usr/local/nodejs"

# download and install:
mkdir -p "$NODE_ROOT"
curl -sLo- https://nodejs.org/dist/v12.19.0/node-v12.19.0-linux-x64.tar.gz | \
    tar xz --strip-components 1 -C "${NODE_ROOT}"

# configure your shell; this assumes bash:
echo "export PATH=\$PATH:${NODE_ROOT}/bin" >> ~/.bashrc
export PATH="${PATH}:${NODE_ROOT}"
node -v # should print "v12.19.0"

# install pnpm:
npm i -g pnpm

# clone the repository:
sudo apt install git -y # in case you don't have git
mkdir -p ~/src && cd ~/src
git clone https://github.com/votingworks/vxsuite.git

# install dependencies:
cd vxsuite
pnpm install

# try out BMD:
cd apps/bmd
pnpm start
# if it worked, go to http://localhost:3000/
```

See the individual README documents for more information on how to run the individual services.

### Adding a monorepo project

This repository is a multi-package repository, or "monorepo". Most of them are NPM packages for NodeJS. Here's how to add a library:

```sh
# put the real name here
LIB=replace-me

# create the library directory
cd vxsuite
mkdir -p "libs/${LIB}"
cd "libs/${LIB}"

mkdir src
echo /lib >> .gitignore

# initialize it
pnpm init "@votingworks/${LIB}"
pnpm i -D typescript jest ts-jest @types/jest @types/node
pnpx tsc --init
pnpx ts-jest config:init
```

- Edit `package.json` as needed, i.e. set `"scripts"` → `"test"` to `"jest"` and `"main"` and `"types"` as appropriate. See existing `libs` for examples.
- Edit `tsconfig.json` as needed, i.e. set `"composite": true` and `"outDir": "./lib"`. See existing `libs` for examples.
- Edit `jest.config.js` as needed, i.e. set coverage thresholds and watch ignore globs. See existing `libs` for examples.

To add a workspace package `foo` as a dependency, do this:
1. Add `"@votingworks/foo": "workspace:*"` to `dependencies` or `devDependencies` as appropriate.
2. Run `pnpm i`.

If you need to add a `@types/` package it's easier to just copy one of the existing `libs/@types` directories than to do the above.

## Development Best Practices

### Use `zod` for validating/parsing JSON data

[`zod`](https://github.com/colinhacks/zod) allows you to build a schema that describes an object's structure:

```ts
import { z } from 'zod'

const Point2dSchema = z.object({
  x: z.number(),
  y: z.number(),
})
```

Schemas can be used to parse incoming JSON data using a helper from `@votingworks/types`:

```ts
import { safeParseJSON } from '@votingworks/types'

const parsed = safeParseJSON(input, Point2dSchema)

if (parsed.isOk()) {
  console.log('Got point:', parsed.ok())
} else {
  console.error('Invalid point:', input)
  console.error('Error:', parsed.err())
}
```

> **Note:** If you already have an `unknown` object from JSON, parse it with `safeParse` e.g. `safeParse(Point2dSchema, obj)`.

The type of `parsed.ok()` in the example above will be `{ x: number; y: number }`. Not bad, but not as descriptive as we'd like. Use this instead to get a more descriptive name:

```ts
import { z, ZodSchema } from 'zod'

interface Point2d {
  readonly x: number
  readonly y: number
}

const Point2dSchema: ZodSchema<Point2d> = z.object({
  x: z.number(),
  y: z.number(),
})
```

Now `parsed.ok()` will have type `Point2d`, which is functionally equivalent but easier to work with. TypeScript will report an error if the types get out of sync.

### Use immutability when feasible

**Example: `readonly` interface properties**

If you don't need to be able to assign to a property, make it `readonly`.

```ts
interface Point2d {
  readonly x: number
  readonly y: number
}
```

**Example: Use `const` instead of `let` (and never use `var`)**

This should be enforced by eslint when a variable is never reassigned. This doesn't mean you should _never_ use `let`, just that a `const` version might be better. If it's better to use `let`, that's fine. There's almost no reason to use `var`, though.

**Example: Update objects and arrays with rest values**

Rather than assigning to an object property, consider building a new object:

```ts
// NOT PREFERRED: toggle test mode by mutating `settings`
settings.testMode = !settings.testMode

// PREFERRED: toggle test mode by creating a new object
settings = { ...settings, testMode: !settings.testMode }
```

### Avoid exceptions when possible

If you expect a situation to happen and you expect to handle it specifically, it's not an exception. Use `Result` from `@votingworks/types` to represent a result that could fail. For example, `safeParseJSON<T>` returns a `Result<T, SyntaxError | ZodError>` that represents either a successfully-parsed object _or_ a parse error of some kind. And (bonus!) the error is typed, whereas it would not be in a `catch` clause. Here's how to make your own fail-able function:

```ts
import { err, ok, Result } from '@votingworks/types'

class DivideByZeroError extends Error {}

function div(numerator: number, denominator: number): Result<number, DivideByZeroError> {
  if (denominator === 0) {
    return err(new DivideByZeroError())
  }

  return ok(numerator / denominator)
}

const result = div(a, b)
if (result.isErr()) {
  if (result.err() instanceof DivideByZeroError) {
    console.error('cannot divide by zero!')
  } else {
    console.error('div failed:', a, '/', b, result.err())
  }
} else {
  console.log('div result:', a, '/', b, '=', result.ok())
}
```

## License

GPLv3
