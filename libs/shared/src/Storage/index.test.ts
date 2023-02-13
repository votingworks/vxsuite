import * as storage from '.';

test('exports the storage types', () => {
  expect(Object.keys(storage)).toMatchInlineSnapshot(`
    [
      "KioskStorage",
      "LocalStorage",
      "MemoryStorage",
    ]
  `);
});
