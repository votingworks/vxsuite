/* eslint-disable vx/gts-unicode-escapes */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { mockFunction } from './mock_function';

describe('mockFunction', () => {
  function add(num1: number, num2: number): number {
    throw new Error('Not implemented');
  }

  it('creates a mock function that returns a value', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    addMock.assertComplete();
  });

  it('ensures the actual input matches the expected input', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    const expectedMessage =
      'Mismatched call to mock function:\nExpected: add(1, 2)\nActual: add(1, 3)';
    expect(() => addMock(1, 3)).toThrow(expectedMessage);
  });

  it('errors on unexpected calls', () => {
    const addMock = mockFunction<typeof add>('add');
    const expectedMessage = 'Unexpected call to mock function: add(1, 2)';
    expect(() => addMock(1, 2)).toThrow(expectedMessage);
  });

  it('handles multiple calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    addMock.expectCallWith(1, 3).returns(4);
    expect(addMock(1, 2)).toEqual(3);
    expect(addMock(1, 3)).toEqual(4);
    addMock.assertComplete();
  });

  it('only allows calls to be used once', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(() => addMock(1, 2)).toThrowErrorMatchingInlineSnapshot(
      `"Unexpected call to mock function: add(1, 2)"`
    );
  });

  it('enforces the order of calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    addMock.expectCallWith(1, 3).returns(4);
    expect(() => addMock(1, 3)).toThrowErrorMatchingInlineSnapshot(`
      "Mismatched call to mock function:
      Expected: add(1, 2)
      Actual: add(1, 3)
      Input diff: [32m- Expected[39m
      [31m+ Received[39m

      [2m  Array [[22m
      [2m    1,[22m
      [32m-   2,[39m
      [31m+   3,[39m
      [2m  ][22m"
    `);
  });

  it('supports all different types of arguments', () => {
    function funcWithManyTypes(
      a: string,
      b: number,
      c: boolean,
      d: null,
      e: undefined,
      f: { foo: string },
      g: number[]
    ): string {
      throw new Error('Not implemented');
    }
    const funcMock =
      mockFunction<typeof funcWithManyTypes>('funcWithManyTypes');
    funcMock
      .expectCallWith('a', 1, true, null, undefined, { foo: 'bar' }, [1, 2])
      .returns('success');
    expect(
      funcMock('a', 1, true, null, undefined, { foo: 'bar' }, [1, 2])
    ).toEqual('success');
    expect(() =>
      funcMock('a', 1, true, null, undefined, { foo: 'bar' }, [1, 2])
    ).toThrowErrorMatchingInlineSnapshot(
      `"Unexpected call to mock function: funcWithManyTypes('a', 1, true, null, undefined, { foo: 'bar' }, [ 1, 2 ])"`
    );
    funcMock.reset();
    funcMock
      .expectCallWith('a', 1, true, null, undefined, { foo: 'bar' }, [1, 2])
      .returns('success');
    expect(() =>
      funcMock('a', 1, true, null, undefined, { foo: 'wrong' }, [1, 2])
    ).toThrowErrorMatchingInlineSnapshot(`
      "Mismatched call to mock function:
      Expected: funcWithManyTypes('a', 1, true, null, undefined, { foo: 'bar' }, [ 1, 2 ])
      Actual: funcWithManyTypes('a', 1, true, null, undefined, { foo: 'wrong' }, [ 1, 2 ])
      Input diff: [32m- Expected[39m
      [31m+ Received[39m

      [2m  Array [[22m
      [2m    "a",[22m
      [2m    1,[22m
      [2m    true,[22m
      [2m    null,[22m
      [2m    undefined,[22m
      [2m    Object {[22m
      [32m-     "foo": "bar",[39m
      [31m+     "foo": "wrong",[39m
      [2m    },[22m
      [2m    Array [[22m
      [2m      1,[22m
      [2m      2,[22m
      [2m    ],[22m
      [2m  ][22m"
    `);
  });

  it('enforces correct types', () => {
    const addMock = mockFunction<typeof add>('add');
    // @ts-expect-error - wrong argument type
    addMock.expectCallWith('1', 2).returns(3);
    // @ts-expect-error - wrong return type
    addMock.expectCallWith(1, 2).returns('3');
  });

  it('supports async functions', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    async function addAsync(num1: number, num2: number): Promise<number> {
      throw new Error('Not implemented');
    }
    const addMock = mockFunction<typeof addAsync>('addAsync');
    addMock.expectCallWith(1, 2).returns(Promise.resolve(3));
    addMock.expectCallWith(1, 2).resolves(3);
    addMock.expectRepeatedCallsWith(1, 2).resolves(3);
    expect(await addMock(1, 2)).toEqual(3);
    expect(await addMock(1, 2)).toEqual(3);
    expect(await addMock(1, 2)).toEqual(3);
    expect(await addMock(1, 2)).toEqual(3);
  });

  it('supports mocking an exception', () => {
    const addMock = mockFunction<typeof add>('add');
    const error = new Error('Mock error');
    addMock.expectCallWith(1, 2).throws(error);
    expect(() => addMock(1, 2)).toThrow(error);
  });

  it('supports repeated calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectRepeatedCallsWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(addMock(1, 2)).toEqual(3);
    addMock.expectCallWith(1, 2).returns(4);
    expect(addMock(1, 2)).toEqual(4);
    addMock.expectRepeatedCallsWith(1, 2).returns(5);
    expect(addMock(1, 2)).toEqual(5);
    expect(addMock(1, 2)).toEqual(5);
    addMock.assertComplete();
  });

  it('errors if actual input doesnt match expected input of repeated call', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectRepeatedCallsWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(() => addMock(1, 3)).toThrowErrorMatchingInlineSnapshot(`
      "Mismatched call to mock function:
      Expected: add(1, 2) (repeated)
      Actual: add(1, 3)
      Input diff: [32m- Expected[39m
      [31m+ Received[39m

      [2m  Array [[22m
      [2m    1,[22m
      [32m-   2,[39m
      [31m+   3,[39m
      [2m  ][22m"
    `);
  });

  it('supports optional repeated calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectOptionalRepeatedCallsWith(1, 2).returns(3);
    addMock.assertComplete();
    expect(addMock(1, 2)).toEqual(3);
    expect(addMock(1, 2)).toEqual(3);
    addMock.assertComplete();
  });

  it('assertComplete errors if not all expected calls are used', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    addMock.expectCallWith(2, 2).returns(4);
    addMock(1, 2);
    expect(() => addMock.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
      "Mismatch between expected mock function calls and actual mock function calls:

      Call #0
      Expected: add(1, 2)
      Actual: add(1, 2)

      Call #1
      Expected: add(2, 2)
      Actual: <none>"
    `);
  });

  it('assertComplete errors if not all repeated expected calls are used', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    addMock.expectRepeatedCallsWith(2, 2).returns(4);
    addMock(1, 2);
    expect(() => addMock.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
      "Mismatch between expected mock function calls and actual mock function calls:

      Call #0
      Expected: add(1, 2)
      Actual: add(1, 2)

      Call #1
      Expected: add(2, 2) (repeated)
      Actual: <none>"
    `);
  });

  it('assertComplete errors if there are unexpected calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(() => addMock(1, 3)).toThrow();
    expect(() => addMock.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
      "Mismatch between expected mock function calls and actual mock function calls:

      Call #0
      Expected: add(1, 2)
      Actual: add(1, 2)

      Call #1
      Expected: <none>
      Actual: add(1, 3)"
    `);
  });

  it('assertComplete errors if there are unexpected calls with repeated calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectRepeatedCallsWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(() => addMock(1, 3)).toThrow();
    expect(() => addMock.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
      "Mismatch between expected mock function calls and actual mock function calls:

      Call #0
      Expected: add(1, 2) (repeated)
      Actual: add(1, 2)

      Call #1
      Expected: add(1, 2) (repeated)
      Actual: add(1, 3)
      Input diff: [32m- Expected[39m
      [31m+ Received[39m

      [2m  Array [[22m
      [2m    1,[22m
      [32m-   2,[39m
      [31m+   3,[39m
      [2m  ][22m"
    `);
  });

  it('assertComplete errors if there are mismatched calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectCallWith(1, 2).returns(3);
    addMock.expectCallWith(1, 3).returns(4);
    expect(() => addMock(1, 3)).toThrow();
    expect(() => addMock(1, 2)).toThrow();
    expect(() => addMock.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
      "Mismatch between expected mock function calls and actual mock function calls:

      Call #0
      Expected: add(1, 2)
      Actual: add(1, 3)
      Input diff: [32m- Expected[39m
      [31m+ Received[39m

      [2m  Array [[22m
      [2m    1,[22m
      [32m-   2,[39m
      [31m+   3,[39m
      [2m  ][22m"
    `);
  });

  it('assertComplete errors if there are mismatched calls with repeated calls', () => {
    const addMock = mockFunction<typeof add>('add');
    addMock.expectRepeatedCallsWith(1, 3).returns(4);
    addMock.expectCallWith(1, 2).returns(3);
    expect(() => addMock(1, 2)).toThrow();
    expect(() => addMock(1, 3)).toThrow();
    expect(() => addMock.assertComplete()).toThrowErrorMatchingInlineSnapshot(`
      "Mismatch between expected mock function calls and actual mock function calls:

      Call #0
      Expected: add(1, 3) (repeated)
      Actual: add(1, 2)
      Input diff: [32m- Expected[39m
      [31m+ Received[39m

      [2m  Array [[22m
      [2m    1,[22m
      [32m-   3,[39m
      [31m+   2,[39m
      [2m  ][22m"
    `);
  });

  it('reset clears the mock state', () => {
    const addMock = mockFunction<typeof add>('add');

    addMock.expectCallWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    addMock.assertComplete();
    addMock.reset();

    addMock.expectCallWith(1, 2).returns(3);
    addMock.reset();

    expect(() => addMock(1, 2)).toThrow();
    addMock.reset();

    addMock.expectRepeatedCallsWith(1, 2).returns(3);
    expect(addMock(1, 2)).toEqual(3);
    expect(addMock(1, 2)).toEqual(3);
    addMock.assertComplete();
    addMock.reset();

    addMock.assertComplete();
  });

  it('properly tracks whether expected calls have been set up', () => {
    const addMock = mockFunction<typeof add>('add');

    expect(addMock.hasExpectedCalls()).toEqual(false);

    addMock.expectCallWith(1, 2).returns(3);
    expect(addMock.hasExpectedCalls()).toEqual(true);

    addMock.reset();
    expect(addMock.hasExpectedCalls()).toEqual(false);

    addMock.expectRepeatedCallsWith(1, 2).returns(3);
    expect(addMock.hasExpectedCalls()).toEqual(true);

    addMock.reset();
    expect(addMock.hasExpectedCalls()).toEqual(false);
  });
});
