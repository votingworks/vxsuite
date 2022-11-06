# Requires type annotations instead of type assertions on object literals (`vx/gts-object-literal-types`)

This rule is from
Google TypeScript Style Guide sections ["Type Assertions and Object Literals"](https://google.github.io/styleguide/tsguide.html#type-assertions-and-object-literals) and ["Structural Types vs Nominal Types"](https://google.github.io/styleguide/tsguide.html#structural-types-vs-nominal-types):

> Use type annotations (`: Foo`) instead of type assertions (`as Foo`) to
> specify the type of an object literal. This allows detecting refactoring bugs
> when the fields of an interface change over time.
>
> TypeScript's type system is structural, not nominal. That is, a value matches
> a type if it has at least all the properties the type requires and the
> properties' types match, recursively.
>
> Use structural typing where appropriate in your code. Outside of test code,
> use interfaces to define structural types, not classes. In test code it can be
> useful to have mock implementations structurally match the code under test
> without introducing an extra interface.
>
> When providing a structural-based implementation, explicitly include the type
> at the declaration of the symbol (this allows more precise type checking and
> error reporting).

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

// this won't be flagged as incorrect here, but only when using it as a `Foo`
const badFoo = {
  bar: 123,
  bam: 'abc',
};
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

### Why?

The `badFoo` object above relies on type inference. Additional fields could be
added to `badFoo` and the type is inferred based on the object itself.

When passing a `badFoo` to a function that takes a `Foo`, the error will be at
the function call site, rather than at the object declaration site. This is also
useful when changing the surface of an interface across broad codebases.

```ts
interface Animal {
  sound: string;
  name: string;
}

function makeSound(animal: Animal) {}

/**
 * 'cat' has an inferred type of '{sound: string}'
 */
const cat = {
  sound: 'meow',
};

/**
 * 'cat' does not meet the type contract required for the function, so the
 * TypeScript compiler errors here, which may be very far from where 'cat' is
 * defined.
 */
makeSound(cat);

/**
 * Horse has a structural type and the type error shows here rather than the
 * function call. 'horse' does not meet the type contract of 'Animal'.
 */
const horse: Animal = {
  sound: 'neigh',
};

const dog: Animal = {
  sound: 'bark',
  name: 'MrPickles',
};

makeSound(dog);
makeSound(horse);
```
