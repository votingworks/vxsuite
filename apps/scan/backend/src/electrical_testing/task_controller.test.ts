import { describe, expect, test } from 'vitest';
import { TaskController } from './task_controller';

describe('TaskController', () => {
  test('is initially not running', () => {
    const loop = new TaskController();
    expect(loop.isRunning()).toEqual(false);
  });

  test('resolves the `onStart` promise on start', async () => {
    const loop = new TaskController();
    const promise = loop.running();
    loop.start();
    expect(loop.isRunning()).toEqual(true);
    await promise;
  });

  test('resolves `waitForRunning` promises when running', async () => {
    const loop = new TaskController();
    loop.start();
    await loop.running();
    await loop.running();
    await loop.running();
  });
});
