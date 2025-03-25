import { describe, expect, test } from 'vitest';
import { TaskController } from './task_controller';

describe('TaskController', () => {
  test('is initially not running', () => {
    const task = new TaskController();
    expect(task.isRunning()).toEqual(false);
  });

  test('resolves the `onStart` promise on start', async () => {
    const task = new TaskController();
    const promise = task.waitUntilIsRunning();
    task.start();
    expect(task.isRunning()).toEqual(true);
    await promise;
  });

  test('resolves `waitForRunning` promises when running', async () => {
    const task = new TaskController();
    task.start();
    await task.waitUntilIsRunning();
    await task.waitUntilIsRunning();
    await task.waitUntilIsRunning();
  });
});
