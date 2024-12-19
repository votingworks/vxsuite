# Requires the use of `snake_case` for module file names (`vx/gts-module-snake-case`)

This rule is from
[Google TypeScript Style Guide section "Identifiers"](https://google.github.io/styleguide/tsguide.html#identifiers):

> Module namespace imports are lowerCamelCase while files are snake_case, which
> means that imports correctly will not match in casing style.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
import * as fooBar from './fooBar';
```

Examples of **correct** code for this rule:

```ts
import * as fooBar from './foo_bar';
```

## Notes

There is no fixer for this as renaming files is outside the scope of ESLint's
fixing API, but there is a codemod at `codemods/src/snake_case.ts` that can be
run to fix violations in bulk. It's not worth it for a single violation, though.
