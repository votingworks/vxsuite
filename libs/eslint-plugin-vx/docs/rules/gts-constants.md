# Requires that `CONSTANT_CASE` be declared `const` (`vx/gts-constants`)

This rule is from
[Google TypeScript Style Guide section "Identifiers"](https://google.github.io/styleguide/tsguide.html#identifiers):

> CONSTANT_CASE indicates that a value is intended to not be changed, and may be used for values that can technically be modified (i.e. values that are not deeply frozen) to indicate to users that they must not be modified.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
let CONSTANT = 1;
var SOME_VALUE = {};
```

Examples of **correct** code for this rule:

```ts
const CONSTANT = 1;
const SOME_VALUE = {};
```
