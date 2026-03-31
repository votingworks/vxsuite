import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { AutoBackupScheduler } from './auto_backup_scheduler';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AutoBackupScheduler', () => {
  test('triggers backup after quiet period', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler(
      { onTrigger },
      1_000, // 1s quiet period
      10_000 // 10s max delay
    );

    scheduler.notifyChange();
    expect(onTrigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  test('resets quiet period on subsequent changes', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler({ onTrigger }, 1_000, 10_000);

    scheduler.notifyChange();
    vi.advanceTimersByTime(500);
    expect(onTrigger).not.toHaveBeenCalled();

    // Second change resets the quiet period
    scheduler.notifyChange();
    vi.advanceTimersByTime(500);
    expect(onTrigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  test('forces backup after max delay even with continuous changes', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler(
      { onTrigger },
      1_000,
      5_000 // 5s max delay
    );

    // Keep making changes every 500ms so quiet period never elapses
    scheduler.notifyChange();
    for (let i = 0; i < 9; i += 1) {
      vi.advanceTimersByTime(500);
      scheduler.notifyChange();
    }
    expect(onTrigger).not.toHaveBeenCalled();

    // Max delay should fire at 5s
    vi.advanceTimersByTime(500);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  test('notifyBackupComplete resets state', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler({ onTrigger }, 1_000, 10_000);

    scheduler.notifyChange();
    expect(scheduler.isBackupNeeded()).toEqual(true);

    scheduler.notifyBackupComplete();
    expect(scheduler.isBackupNeeded()).toEqual(false);

    // Timer should have been cleared — advancing should not trigger
    vi.advanceTimersByTime(2_000);
    expect(onTrigger).not.toHaveBeenCalled();

    scheduler.stop();
  });

  test('isBackupNeeded reflects change state', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler({ onTrigger }, 1_000, 10_000);

    expect(scheduler.isBackupNeeded()).toEqual(false);
    scheduler.notifyChange();
    expect(scheduler.isBackupNeeded()).toEqual(true);

    scheduler.stop();
  });

  test('stop prevents further triggers', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler({ onTrigger }, 1_000, 10_000);

    scheduler.notifyChange();
    scheduler.stop();

    vi.advanceTimersByTime(2_000);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  test('notifyChange after stop is ignored', () => {
    const onTrigger = vi.fn();
    const scheduler = new AutoBackupScheduler({ onTrigger }, 1_000, 10_000);

    scheduler.stop();
    scheduler.notifyChange();

    vi.advanceTimersByTime(2_000);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
