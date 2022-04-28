# vxsuite

The VotingWorks in-person voting system.

## About

Includes software for a [ballot-marking device (BMD)](./frontends/bmd), a
[ballot activation system (BAS)](./frontends/bas), a
[ballot scanning device (BSD)](./frontends/bsd), a
[precinct scanner](./frontends/precinct-scanner), and an
[election manager](./frontends/election-manager). See https://voting.works for
more information about VotingWorks.

## Development

Building VxSuite for development requires git, [NodeJS](https://nodejs.org/)
v12.19.0 and [pnpm](https://pnpm.js.org) v5.

Most of the code is written in TypeScript. We follow the
[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
and parts of [Airbnb JavaScript Style Guide](https://airbnb.io/javascript/),
with most of it enforced by ESLint rules.

By default developing a React app will show ESLint errors while developing. To
disable this feature, run with this environment variable:
`ESLINT_NO_DEV_ERRORS=true`. If you always prefer not to have this behavior,
consider setting that in your shell configuration (e.g. `.bashrc`).

### Developing on a VM from MacOS

We strongly recommend development in this repo on a VM running Debian. Our
production machines are configured with Debian so this will allow for you to
develop in the environment most similar to production. Additionally VM features
such as snapshots make development much more straightforward. See the
[Virtual Machine Setup Guide](./VirtualMachineSetup.md) for more details on how
to best configure this VM. Then come back and follow the steps in the Debian
quickstart below to get developing.

### Debian Quickstart

This expects Debian 11.02, though it may work on other versions.

Debian, by default, does not give your primary user account sudo access. Most of
our scripts are designed assuming you will have sudo access so is most
straightforward to simply add yourself to the sudoers file. You can do this with
the following commands.

```sh
su - # this will prompt for the root password
usermod -aG sudo <USERNAME> # use your user account username
exit
```

Restart your machine or open a new terminal for the changes to take effect. You
can verify it worked after restart by entering `sudo whoami` in the terminal and
you should see `root`.

Next install git, and create an SSH key following the
[github guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).
You will need to add the key to your github account. Then clone the vxsuite
repositories.

```sh
sudo apt update
sudo apt install -y git make
echo "export PATH=\${PATH}:/usr/sbin" >> ~/.bashrc # Only for debian, add sbin to your path
ssh-keygen -t ed25519 -C "your_github_email@example.com" # Save to the default location, and chose a passphrase
eval "$(ssh-agent -s)" # start the ssh agent
ssh-add ~/.ssh/id_ed25519 # add your ssh key to the agent
cat ~/.ssh/id_ed25519.pub # Copy the public key and add it to your github account
ssh -T git@github.com # This should return `Hi username! You've successfully authenticated, but GitHub does not provide shell access.
mkdir code
cd code
git clone git@github.com:votingworks/vxsuite.git

# If you are doing a lot of development in vxsuite you will likely eventually need the following repos.
# kiosk-browser is an electron-based browser where our apps run in production.
git clone git@github.com:votingworks/kiosk-browser.git
# vxsuite-complete-system packages vxsuite and kiosk-browser for running in production with various setup scripts for production machines. If you want to test your code through kiosk-browser without needing to develop on kiosk-browser it is recommended you run kiosk-browser through the instructions in this repo.
git clone git@github.com:votingworks/vxsuite-complete-system.git
```

Once you finish setting up your VM before you start develop you should also set
up [GPG Keys](#setting-up-gpg-keys) for your github account.

Install Node, npm, yarn, and pnpm by running the following script:

```sh
cd vxsuite
./script/setup-dev
node -v # this should return 12.x.x
pnpm -v # this should return 5.x.x
```

Automatically install all dependencies in the vxsuite repo with the following
command

```sh
./script/bootstrap
```

Test that you can run the code

```sh
# try out BMD:
make -C services/smartcards build run &
# ^ wait for this to settle, then…
cd frontends/bmd
pnpm install
pnpm build
pnpm start
# if it worked, go to http://localhost:3000/ in your VM
```

If you have VS Code open and connected to your VM remotely it should
automatically forward the port for you, and you can visit
`http://localhost:3000` on your home machine as well.

See the individual README documents for more information on how to run the
individual services.

See the [README](https://github.com/votingworks/vxsuite-complete-system) in
`vxsuite-complete-system` for information on how to test the apps in this repo
through kiosk-browser (electron-based browser that runs our apps in production).

### Setting up GPG Keys

Setting up GPG keys with your github account will allow you to sign tags and
commits locally. These are verified by GitHub which gives everyone confidence
about the origin of changes you've made. You can follow the
[steps in the github docs](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
to set this up. Note that this is a step that happens in ADDITION to ssh keys,
not in substitute of them. Debian comes with gpg installed so you can skip the
first step about installing GPG tools if you are on your Debian machine. You
will want to follow the instructions in _Generating a new GPG key_, _Add a new
GPG key_, _Tell Git your signing key_. Then follow the steps in _Signing
commits_ to test signing a commit and pushing to github to make sure it is
**verified**.

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
import { z } from 'zod';

const Point2dSchema = z.object({
  x: z.number(),
  y: z.number(),
});
```

Schemas can be used to parse incoming JSON data using a helper from
`@votingworks/types`:

```ts
import { safeParseJSON } from '@votingworks/types';

const parsed = safeParseJSON(input, Point2dSchema);

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
result that could fail. For example, `safeParseJSON<T>` returns a
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
import { enable } from 'debug';
enable('math:*'); // or whatever globs you want
```

## License

GPLv3
