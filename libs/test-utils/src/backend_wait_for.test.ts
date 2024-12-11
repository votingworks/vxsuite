import { expect, test } from 'vitest';
import { nextTick } from 'node:process';
import { backendWaitFor } from './backend_wait_for';

test('if no waiting is necessary, runs only once', async () => {
  let tries = 0;
  await backendWaitFor(() => {
    tries += 1;
  });
  expect(tries).toEqual(1);
});

test('if waiting is necessary, tries waiting', async () => {
  let someState = false;
  const someProcess = new Promise<void>((resolve) => {
    nextTick(() => {
      someState = true;
      resolve();
    });
  });

  let tries = 0;
  await backendWaitFor(() => {
    tries += 1;
    expect(someState).toEqual(true);
  });
  expect(tries).toBeGreaterThan(1);

  await someProcess; // cleanup
});

test('throws error if still failing before last retry', async () => {
  let someState = false;
  const someProcess = new Promise<void>((resolve) => {
    nextTick(() => {
      someState = true;
      resolve();
    });
  });

  await expect(
    backendWaitFor(
      () => {
        expect(someState).toEqual(true);
      },
      { retries: 0 }
    )
  ).rejects.toThrow();

  await someProcess; // cleanup
});
