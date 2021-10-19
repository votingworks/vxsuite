import { waitFor } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react-hooks';
import { MemoryStorage } from '@votingworks/utils/src';
import { z } from 'zod';
import { useStoredState } from './useStoredState';

test('no initial value + updates', async () => {
  const storage = new MemoryStorage();
  const schema = z.number();

  const { result } = renderHook(() =>
    useStoredState(storage, 'test-key', schema)
  );

  // test direct set value
  {
    const [number, setNumber] = result.current;
    await waitFor(() => expect(number).toBeUndefined());
    act(() => setNumber(99));
  }

  // test set via callback
  {
    const [number, setNumber] = result.current;
    await waitFor(() => expect(number).toEqual(99));
    expect(await storage.get('test-key')).toEqual(99);
    act(() => setNumber((prev = 0) => prev + 1));
  }

  // test removal
  {
    const [number, setNumber] = result.current;
    await waitFor(() => expect(number).toEqual(100));
    expect(await storage.get('test-key')).toEqual(100);
    act(() => setNumber(undefined));
  }

  {
    const [number] = result.current;
    await waitFor(() => expect(number).toBeUndefined());
    expect(await storage.get('test-key')).toBeUndefined();
  }

  const allSetters = result.all.map((errorOrValueAndSetter) => {
    if (errorOrValueAndSetter instanceof Error) {
      throw errorOrValueAndSetter;
    }

    return errorOrValueAndSetter[1];
  });

  // verify that the setter doesn't change
  expect(allSetters).toHaveLength(4);
  expect([...new Set(allSetters)]).toHaveLength(1);
});

test('has initial value + updates', async () => {
  const storage = new MemoryStorage();
  const schema = z.boolean();

  const { result } = renderHook(() =>
    useStoredState(storage, 'test-key', schema, false)
  );

  {
    const [boolean, setBoolean] = result.current;
    await waitFor(() => expect(boolean).toEqual(false));
    act(() => setBoolean(true));
  }

  {
    const [boolean, setBoolean] = result.current;
    await waitFor(() => expect(boolean).toEqual(true));
    expect(await storage.get('test-key')).toEqual(true);
    act(() => setBoolean((prev) => !prev));
  }

  {
    const [boolean] = result.current;
    await waitFor(() => expect(boolean).toEqual(false));
    expect(await storage.get('test-key')).toEqual(false);
  }
});

test('restores complex object', async () => {
  const storage = new MemoryStorage();
  const schema = z.object({
    a: z.number(),
    b: z.boolean(),
    c: z.array(z.number()),
  });
  const value: z.TypeOf<typeof schema> = {
    a: 1,
    b: true,
    c: [99],
  };

  await storage.set('test-key', value);

  const { result } = renderHook(() =>
    useStoredState(storage, 'test-key', schema)
  );
  await waitFor(() => expect(result.current[0]).toEqual(value));
});

test('switching storage', async () => {
  const storage1 = new MemoryStorage();
  const storage2 = new MemoryStorage();
  const schema = z.number();

  await storage1.set('test-key', 1);
  await storage2.set('test-key', 2);

  const { result, rerender } = renderHook(
    ({ storage }) => useStoredState(storage, 'test-key', schema),
    { initialProps: { storage: storage1 } }
  );
  await waitFor(() => expect(result.current[0]).toEqual(1));

  // test that it re-pulls the value
  rerender({ storage: storage2 });
  await waitFor(() => expect(result.current[0]).toEqual(2));

  // test that it sets to the new storage
  const [, setValue] = result.current;
  act(() => setValue(222));
  await waitFor(async () => {
    expect(await storage1.get('test-key')).toEqual(1);
    expect(await storage2.get('test-key')).toEqual(222);
  });
});

test('switching keys', async () => {
  const storage = new MemoryStorage();
  const schema = z.number();

  await storage.set('test-key1', 1);
  await storage.set('test-key2', 2);

  const { result, rerender } = renderHook(
    ({ key }) => useStoredState(storage, key, schema),
    { initialProps: { key: 'test-key1' } }
  );
  await waitFor(() => expect(result.current[0]).toEqual(1));

  // test that it re-pulls the value
  rerender({ key: 'test-key2' });
  await waitFor(() => expect(result.current[0]).toEqual(2));

  // test that it sets to the new key
  const [, setValue] = result.current;
  act(() => setValue(222));
  await waitFor(async () => {
    expect(await storage.get('test-key1')).toEqual(1);
    expect(await storage.get('test-key2')).toEqual(222);
  });
});
