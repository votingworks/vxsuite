# vxsuite

The VotingWorks in-person voting system.

## About

Includes software for a [ballot-marking device (BMD)](./frontends/bmd), a
[ballot activation system (BAS)](./frontends/bas), a
[ballot scanning device (BSD)](./frontends/bsd), a
[precinct scanner](./frontends/precinct-scanner), and an
[election manager](./frontends/election-manager). See https://voting.works for more
information about VotingWorks.

## Development

Building VxSuite for development requires git, [NodeJS](https://nodejs.org/)
v12.19.0 and [pnpm](https://pnpm.js.org).

Most of the code is written in TypeScript. We follow the
[Airbnb JavaScript Style Guide](https://airbnb.io/javascript/), with most of it
enforced by ESLint rules.

By default developing a React app will show ESLint errors while developing. To
disable this feature, run with this environment variable:
`ESLINT_NO_DEV_ERRORS=true`. If you always prefer not to have this behavior,
consider setting that in your shell configuration (e.g. `.bashrc`).

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
npm i -g pnpm@5

# clone the repository:
sudo apt install git -y # in case you don't have git
mkdir -p ~/src && cd ~/src
git clone https://github.com/votingworks/vxsuite.git

# install dependencies:
cd vxsuite
./script/bootstrap

# try out BMD:
make -C services/smartcards build run &
cd frontends/bmd
pnpm start
# if it worked, go to http://localhost:3000/
```

See the individual README documents for more information on how to run the
individual services.

### Adding a monorepo project

This repository is a multi-package repository, or "monorepo". Most of them are
NPM packages for NodeJS. Here's how to add a library:

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

- Edit `package.json` as needed, i.e. set `"scripts"` → `"test"` to `"jest"` and
  `"main"` and `"types"` as appropriate. See existing `libs` for examples.
- Edit `tsconfig.json` as needed, i.e. set `"composite": true` and
  `"outDir": "./lib"`. See existing `libs` for examples.
- Edit `jest.config.js` as needed, i.e. set coverage thresholds and watch ignore
  globs. See existing `libs` for examples.

To add a workspace package `foo` as a dependency, do this:

1. Add `"@votingworks/foo": "workspace:*"` to `dependencies` or
   `devDependencies` as appropriate.
2. Run `pnpm i`.

If you need to add a `@types/` package it's easier to just copy one of the
existing `libs/@types` directories than to do the above.

## Contributing

Hey, we’re stoked that you’d like to contribute. Please let us know how we can
help you contribute.

1. Fork this repo: <https://github.com/votingworks/vxsuite>
1. Clone the repo locally:

   ```sh
   git clone https://github.com/YOUR_GITHUB_USERNAME/vxsuite.git
   ```

   Optionally, if you already cloned the main repo, you can update your local
   repo to have two remotes, `votingworks` for the main repo and `origin` for
   your fork:

   ```sh
   git remote rename origin votingworks
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/vxsuite.git
   ```

1. Ensure you're set up for development by following the instructions in the
   [Development](#Development) section.

1. Create a branch for the feature/bug/etc:

   ```sh
   git checkout -b name-of-your-branch
   ```

1. For an app, run the app:

   ```sh
   pnpm start
   ```

   Or, for a library, run the build watcher:

   ```sh
   pnpm build:watch
   ```

1. In a second console window, run the tests:

   ```sh
   pnpm test
   ```

   Tests default to watch-mode: only tests related to changed code will run. Use
   the available commands in watch-mode to run the tests you want.

1. Add features, fix bugs, etc. Follow the best practices described below. Then
   use `git` to commit your changes in logical commits.

   You may wish to run this before committing to fix code styling:

   ```sh
   pnpm lint:fix
   ```

   **Using Visual Studio Code?** Autorun linting and code formatting by
   installing/enabling/disabling the following plugins (which will pick up the
   respective config files in this project):

   - disable `TSLint` as ESLint handles this functionality
   - install/enable `ESLint` for (ECMAScript) JavaScript linting
   - install/enable `stylelint` for modern CSS linting

1. Check for test coverage. When you push your branch to github, CircleCI will
   run all the tests and check for test coverage. To check this yourself, run:

   ```sh
   pnpm test:coverage
   ```

   In the root of the project there is a `coverage` directory. Open
   `coverage/lcov-report/index.html` in a browser to navigate the files to view
   test coverage.

   > **NOTE:** You can probably run `python -m SimpleHTTPServer` to serve the
   > files, then view them at http://localhost:8080/.

1. Run integration tests. You will need to make sure to have cypress
   dependencies installed see: https://on.cypress.io/required-dependencies. You
   will also need to have chrome installed. While the server is running in
   another terminal window run:

   ```
   pnpm cypress:run
   ```

1. Push your branch to your fork on Github.
1. Create a pull request to merge your branch into `votingworks/vxsuite/main`.
   Once the pull request is created CircleCI will automatically run all the
   tests to ensure the app is working correctly.
1. @votingworks/eng will review the pull request and ask questions, request
   changes, or just merge right away.

## Development Best Practices

### Use `zod` for validating/parsing JSON data

[`zod`](https://github.com/colinhacks/zod) allows you to build a schema that
describes an object's structure:

```ts
import { z } from 'zod'

const Point2dSchema = z.object({
  x: z.number(),
  y: z.number(),
})
```

Schemas can be used to parse incoming JSON data using a helper from
`@votingworks/types`:

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

> **Note:** If you already have an `unknown` object from JSON, parse it with
> `safeParse` e.g. `safeParse(Point2dSchema, obj)`.

The type of `parsed.ok()` in the example above will be
`{ x: number; y: number }`. Not bad, but not as descriptive as we'd like. Use
this instead to get a more descriptive name:

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

Now `parsed.ok()` will have type `Point2d`, which is functionally equivalent but
easier to work with. TypeScript will report an error if the types get out of
sync.

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

This should be enforced by eslint when a variable is never reassigned. This
doesn't mean you should _never_ use `let`, just that a `const` version might be
better. If it's better to use `let`, that's fine. There's almost no reason to
use `var`, though.

**Example: Update objects and arrays with rest values**

Rather than assigning to an object property, consider building a new object:

```ts
// NOT PREFERRED: toggle test mode by mutating `settings`
settings.testMode = !settings.testMode

// PREFERRED: toggle test mode by creating a new object
settings = { ...settings, testMode: !settings.testMode }
```

### Avoid exceptions when possible

If you expect a situation to happen and you expect to handle it specifically,
it's not an exception. Use `Result` from `@votingworks/types` to represent a
result that could fail. For example, `safeParseJSON<T>` returns a
`Result<T, SyntaxError | ZodError>` that represents either a successfully-parsed
object _or_ a parse error of some kind. And (bonus!) the error is typed, whereas
it would not be in a `catch` clause. Here's how to make your own fail-able
function:

```ts
import { err, ok, Result } from '@votingworks/types'

class DivideByZeroError extends Error {}

function div(
  numerator: number,
  denominator: number
): Result<number, DivideByZeroError> {
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
DEBUG=math:geomery pnpm start
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
import { enable } from 'debug'
enable('math:*') // or whatever globs you want
```

## License

GPLv3
