# Disallows use of for-in loops (`vx/gts-no-for-in-loop`)

This rule is from
[Google TypeScript Style Guide section "Iterating objects"](https://google.github.io/styleguide/tsguide.html#iterating-objects):

> Iterating objects with for (... in ...) is error prone. It will include enumerable properties from the prototype chain.
> Do not use unfiltered for (... in ...) statements:
> Either filter values explicitly with an if statement, or use for (... of Object.keys(...)).

Note that our implementation of this rule does not check for an `if` statement guard, but rather disallows all `for-in` loops and replaces them with `for-of` loops. We have an additional rule (`vx/gts-no-unnecessary-has-own-property-check`) that finds unnecessary `if` statement guards that may result from this fix.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
for (const x in someObj) {
  // x could come from some parent prototype!
}
```

Examples of **correct** code for this rule:

```ts
for (const x of Object.keys(someObj)) { // note: for _of_!
  // now x was definitely defined on someObj
}
for (const [key, value] of Object.entries(someObj)) { // note: for _of_!
  // now key was definitely defined on someObj
}
```
