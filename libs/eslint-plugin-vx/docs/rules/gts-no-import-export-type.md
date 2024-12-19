# Disallows use of `import type` and `export type` (`vx/gts-no-import-export-type`)

This rule is from
[Google TypeScript Style Guide section "Import & export type"](https://google.github.io/styleguide/tsguide.html#import-export-type):

> Do not use `import type ... from` or `export type ... from`.
>
> Note: this does not apply to exporting type definitions, i.e.
> `export type Foo = ...`.
>
> TypeScript tooling automatically distinguishes symbols used as types vs
> symbols used as values and only generates runtime loads for the latter.
>
> `export type` might seem useful to avoid ever exporting a value symbol for an
> API. However it does not give guarantees either: downstream code might still
> import an API through a different path. A better way to split & guarantee type
> vs value usages of an API is to actually split the symbols into e.g.
> `UserService` and `AjaxUserService`. This is less error prone and also better
> communicates intent.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
import type { Foo } from './foo'
export type { Bar } from './bar'
```

Examples of **correct** code for this rule:

```ts
import { Foo } from './foo'
export { Bar } from './bar'
```

## Rule Options

```js
...
"vx/no-import-export-type": [<enabled>, { "allowReexport": <boolean> }]
...
```

### `allowReexport` (default: `false`)

Though the default is `false`, this is `true` in the `react` configuration
because Create React App forces using the `isolatedModules` TypeScript compiler
option. This requires that any imported symbols corresponding to types that are
re-exported are imported with `import type`. `allowReexport` is `true` in React
apps to account for this.

Examples of **correct** code for this rule, when `allowReexport` is `true`:

```ts
export type { Foo } from './Foo'
export type * as Utils from './utils'

import type { Bar } from './Bar'
export type { Bar }
```
