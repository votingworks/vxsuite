import { Application } from 'express';

/**
 * A handle to a running background loop (typically backed by `setInterval`). The
 * loop must be stopped when the app shuts down so its timer does not leak. This
 * matters especially in tests, where a leaked interval keeps the event loop busy
 * across subsequent test cases and can cause unrelated tests to time out.
 */
export interface Poller {
  /** Stops the background loop and releases its timer. Safe to call twice. */
  stop: () => void;
}

/**
 * Manages a background {@link Poller} that can be restarted over the app's
 * lifetime (e.g. polling is restarted after the machine is unconfigured). Always
 * stops the previous loop before starting a new one so timers do not accumulate.
 */
export class RestartablePoller {
  private poller: Poller;

  constructor(private readonly startPoller: () => Poller) {
    this.poller = startPoller();
  }

  restart(): void {
    this.poller.stop();
    this.poller = this.startPoller();
  }

  stop(): void {
    this.poller.stop();
  }
}

const stopFnByApp = new WeakMap<Application, () => void>();

/**
 * Records how to stop all of an app's background loops. Keyed off the app so the
 * app builders can keep returning a plain express `Application` while still
 * exposing cleanup to callers (notably the test harness).
 */
export function setStopBackgroundTasks(
  app: Application,
  stop: () => void
): void {
  stopFnByApp.set(app, stop);
}

/** Stops all background loops previously registered for `app`. */
export function stopBackgroundTasks(app: Application): void {
  stopFnByApp.get(app)?.();
}
