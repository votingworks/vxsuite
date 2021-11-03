import { LocalStorage } from './LocalStorage';

beforeEach(() => {
  window.localStorage.clear();
});

it('uses local storage as the backing store', async () => {
  const storage = new LocalStorage();
  await storage.set('a', { b: 'c' });
  expect(JSON.parse(window.localStorage.getItem('a') || '')).toEqual({
    b: 'c',
  });

  window.localStorage.setItem('b', JSON.stringify({ a: 1 }));
  expect(await new LocalStorage().get('b')).toEqual({ a: 1 });
});

it('fails if the underlying value is not JSON', async () => {
  window.localStorage.setItem('a', 'this is not JSON');
  await expect(async () => await new LocalStorage().get('a')).rejects.toThrow(
    /JSON/
  );
});

it('can remove a value', async () => {
  const storage = new LocalStorage();

  expect(await storage.get('a')).toBeUndefined();
  window.localStorage.setItem('a', JSON.stringify({}));
  expect(await storage.get('a')).toBeDefined();
  await storage.remove('a');
  expect(await storage.get('a')).toBeUndefined();
});

it('can clear all values', async () => {
  const storage = new LocalStorage();

  window.localStorage.setItem('a', JSON.stringify({}));
  window.localStorage.setItem('b', JSON.stringify({}));
  await storage.clear();
  expect(await storage.get('a')).toBeUndefined();
  expect(await storage.get('b')).toBeUndefined();
});

it('serializes values as they are put in storage', async () => {
  const storage = new LocalStorage();
  const object = { b: 1 };

  await storage.set('a', object);
  object.b = 2;

  expect(await storage.get('a')).toEqual({ b: 1 });
});
