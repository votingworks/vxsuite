# Requires spreading iterables in arrays and objects in objects (`vx/gts-spread-like-types`)

This rule is from
[Google TypeScript Style Guide section "Using the spread operator"](https://google.github.io/styleguide/tsguide.html#using-the-spread-operator):

> Using the spread operator `[...foo]; {...bar}` is a convenient shorthand for
> copying arrays and objects. When using the spread operator on objects, later
> values replace earlier values at the same key.
>
> When using the spread operator, the value being spread must match what is
> being created. That is, when creating an object, only objects may be used with
> the spread operator; when creating an array, only spread iterables.
> Primitives, including `null` and `undefined`, may never be spread.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const foo = { num: 7 };
const bar = { num: 5, ...(shouldUseFoo && foo) }; // might be undefined

// Creates {0: 'a', 1: 'b', 2: 'c'} but has no length
const fooStrings = ['a', 'b', 'c'];
const ids = { ...fooStrings };
```

Examples of **correct** code for this rule:

```ts
const foo = shouldUseFoo ? { num: 7 } : {};
const bar = { num: 5, ...foo };
const fooStrings = ['a', 'b', 'c'];
const ids = [...fooStrings, 'd', 'e'];
```
