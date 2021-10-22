# Requires type annotations instead of type assertions on object literals (`vx/gts-no-object-literal-type-assertions`)

This rule is from
[Google TypeScript Style Guide section "Type Assertions and Object Literals"](https://google.github.io/styleguide/tsguide.html#type-assertions-and-object-literals):

> Use type annotations (`: Foo`) instead of type assertions (`as Foo`) to
> specify the type of an object literal. This allows detecting refactoring bugs
> when the fields of an interface change over time.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
interface Foo {
  bar: number;
  baz?: string; // was "bam", but later renamed to "baz".
}

const foo = {
  bar: 123,
  bam: 'abc', // no error!
} as Foo;

function func() {
  return {
    bar: 123,
    bam: 'abc', // no error!
  } as Foo;
}
```

Examples of **correct** code for this rule:

```ts
interface Foo {
  bar: number;
  baz?: string;
}

const foo: Foo = {
  bar: 123,
  bam: 'abc', // complains about "bam" not being defined on Foo.
};

function func(): Foo {
  return {
    bar: 123,
    bam: 'abc', // complains about "bam" not being defined on Foo.
  };
}
```
