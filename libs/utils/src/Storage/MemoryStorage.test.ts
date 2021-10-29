import { MemoryStorage } from './MemoryStorage';

it('can be initialized with data', async () => {
  const storage = new MemoryStorage({
    a: { c: 1 },
    b: { d: 2 },
  });

  expect(await storage.get('a')).toEqual({ c: 1 });
  expect(await storage.get('b')).toEqual({ d: 2 });
  expect(await storage.get('c')).toBeUndefined();
});

it('can remove a value', async () => {
  const storage = new MemoryStorage();

  await storage.set('a', {});
  expect(await storage.get('a')).toBeDefined();
  await storage.remove('a');
  expect(await storage.get('a')).toBeUndefined();
});

it('can clear all values', async () => {
  const storage = new MemoryStorage();

  await storage.set('a', {});
  await storage.set('b', {});
  await storage.clear();
  expect(await storage.get('a')).toBeUndefined();
  expect(await storage.get('b')).toBeUndefined();
});

it('serializes values as they are put in storage', async () => {
  const storage = new MemoryStorage();
  const object = { b: 1 };

  await storage.set('a', object);
  object.b = 2;

  expect(await storage.get('a')).toEqual({ b: 1 });
});
