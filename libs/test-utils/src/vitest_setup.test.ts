// @vitest-environment jsdom
import { expect, test } from 'vitest';
import './vitest_setup.js';

test('registers the jest-dom matchers', async () => {
  const element = document.createElement('div');
  expect(element).not.toBeInTheDocument();
  document.body.append(element);
  expect(element).toBeInTheDocument();
  await expect(Promise.resolve(element)).resolves.toBeInTheDocument();
});
