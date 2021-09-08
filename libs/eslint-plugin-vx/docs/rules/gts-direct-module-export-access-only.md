# Enforces using module objects for direct export access only (`vx/gts-direct-module-export-access-only`)

This rule is from
[Google TypeScript Style Guide section "Optimization compatibility for module object imports"](https://google.github.io/styleguide/tsguide.html#optimization-compatibility-for-module-object-imports):

> When importing a module object, directly access properties on the module
> object rather than passing it around. This ensures that modules can be
> analyzed and optimized. Treating module imports as namespaces is fine.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
import * as utils from 'utils'
class A {
  readonly utils = utils
}
```

Examples of **correct** code for this rule:

```ts
import { method1, method2 } from 'utils'
class A {
  readonly utils = { method1, method2 }
}
```

```ts
import * as utils from 'utils'
class A {
  readonly utils = { method1: utils.method1, method2: utils.method2 }
}
```
