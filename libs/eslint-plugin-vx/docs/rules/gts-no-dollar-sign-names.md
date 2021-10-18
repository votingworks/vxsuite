# Disallows use of $ in identifiers, except when aligning with naming conventions for third party frameworks. (`vx/gts-no-dollar-sign-names`)

This rule is from
[Google TypeScript Style Guide section "Identifiers"](https://google.github.io/styleguide/tsguide.html#identifiers):

> Identifiers should not generally use `$`, except when aligning with naming conventions for third party frameworks.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const $button = useRef<HTMLButtonElement>(null)
```

Examples of **correct** code for this rule:

```ts
const buttonRef = useRef<HTMLButtonElement>(null)
```
