import { expect, test } from 'vitest';
import { generateId } from './ids.js';

test('generateId', () => {
  const id = generateId();
  expect(id).toMatch(/^[0-9a-z]{12}$/);
  expect(generateId()).not.toEqual(id);
});
