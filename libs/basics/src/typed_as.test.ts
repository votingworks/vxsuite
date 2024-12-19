import { expect, test } from 'vitest';
import { typedAs } from './typed_as';

test('typedAs', () => {
  interface SomeType {
    someString: string;
  }

  expect(typedAs<SomeType>({ someString: 'a string' })).toEqual({
    someString: 'a string',
  });
  // @ts-expect-error - Type 'number' is not assignable to type 'string'.
  typedAs<SomeType>({ someString: 1 });
});
