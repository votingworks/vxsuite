# Use function declarations instead of function variable declarations (`vx/gts-func-style`)

This rule is from
[Google TypeScript Style Guide section "Function Declarations"](https://google.github.io/styleguide/tsguide.html#function-declarations):

> Use `function foo() { ... }` to declare named functions, including functions
> in nested scopes, e.g. within another function.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
const foo = function () {
  /* ... */
};
```

Examples of **correct** code for this rule:

```ts
function foo() {
  /* ... */
}

// Use arrow functions assigned to variables instead of function declarations if
// the function accesses the outer scope's `this`
const foo = () => {
  console.log(this);
}

// Top level arrow functions may be used to explicitly declare that a function
// implements an interface.
interface SearchFunction {
  (source: string, subString: string): boolean;
}

const fooSearch: SearchFunction = (source, subString) => { ... };
```
