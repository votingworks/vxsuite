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

  test('resolves `waitForIsStopped` promises when stopping', async () => {
    const task = new TaskController();
    const stopPromise = task.waitUntilIsStopped();
    task.start();
    task.stop();
    await stopPromise;
  });

  test('state transitions', () => {
    // Initial state
    const task = new TaskController();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(false);
    expect(task.isStopped()).toEqual(false);

    // Pause before start has no effect
    task.pause();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(false);
    expect(task.isStopped()).toEqual(false);

    // Start the task
    task.start();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(true);
    expect(task.isStopped()).toEqual(false);

    // 2nd time has no effect
    task.start();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(true);
    expect(task.isStopped()).toEqual(false);

    // Pause the task once started
    task.pause();
    expect(task.isPaused()).toEqual(true);
    expect(task.isRunning()).toEqual(false);
    expect(task.isStopped()).toEqual(false);

    // 2nd time has no effect
    task.pause();
    expect(task.isPaused()).toEqual(true);
    expect(task.isRunning()).toEqual(false);
    expect(task.isStopped()).toEqual(false);

    // Resume the paused task
    task.resume();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(true);
    expect(task.isStopped()).toEqual(false);

    // 2nd time has no effect
    task.resume();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(true);
    expect(task.isStopped()).toEqual(false);

    // Stop the resumed task
    task.stop();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(false);
    expect(task.isStopped()).toEqual(true);

    // 2nd time has no effect
    task.stop();
    expect(task.isPaused()).toEqual(false);
    expect(task.isRunning()).toEqual(false);
    expect(task.isStopped()).toEqual(true);
  });

  test('TaskController::started', () => {
    const task = TaskController.started();
    expect(task.getStatus()).toEqual('running');
  });
});
