import { deferred, Optional } from '@votingworks/basics';

/**
 * Status of a `TaskController` task, which you can think of as labels for
 * states in a state machine.
 */
export type TaskStatus = 'init' | 'running' | 'paused' | 'stopped';

/**
 * Keeps track of the status of a running task and provides methods to control it.
 */
export class TaskController<State = void, Product = void> {
  private state: State;
  private status: TaskStatus = 'init';
  private onRunning = deferred<void>();
  private readonly onStop = deferred<Optional<Product>>();

  /**
   * Pause the task if it is running.
   *
   * @returns true if the task was paused, false otherwise.
   */
  pause(): boolean {
    if (this.status === 'running') {
      this.setStatus('paused');
      this.onRunning = deferred<void>();
      return true;
    }
    return false;
  }

  /**
   * Resume the task if it was paused.
   *
   * @returns true if the task was resumed, false otherwise.
   */
  resume(): boolean {
    if (this.status === 'paused') {
      this.setStatus('running');
      this.onRunning.resolve();
      return true;
    }
    return false;
  }

  /**
   * Stops the task if it is not already stopped.
   *
   * @param product the end result of the task, if any.
   * @returns true if the task was stopped, false otherwise.
   */
  stop(product?: Product): boolean {
    if (this.status !== 'stopped') {
      this.setStatus('stopped');
      this.onStop.resolve(product);
      return true;
    }
    return false;
  }

  /**
   * Starts the task if it has never been started or stopped before.
   *
   * @returns true if the task was started, false otherwise.
   */
  start(): boolean {
    if (this.status === 'init') {
      this.setStatus('running');
      this.onRunning.resolve();
      return true;
    }
    return false;
  }

  /**
   * Creates a new task controller with the given state.
   */
  constructor();
  constructor(state: State);
  constructor(state?: State) {
    this.state = state as State;
  }

  /**
   * Creates a new task controller that is already started.
   */

  static started<Product = void>(): TaskController<void, Product>;
  static started<State = void, Product = void>(
    state: State
  ): TaskController<State, Product>;
  // eslint-disable-next-line vx/gts-no-return-type-only-generics
  static started<State = void, Product = void>(
    state?: State
  ): TaskController<State, Product> {
    const controller = new TaskController<State, Product>(state as State);
    controller.start();
    return controller;
  }

  /**
   * Sets the status of the task. This method does not validate that it is
   * possible to transition to the new status from the current status.
   */
  private setStatus(newStatus: TaskStatus): void {
    this.status = newStatus;
  }

  /**
   * Gets the current state for this task.
   */
  getState(): State {
    return this.state;
  }

  /**
   * Updates the task's state to the given value.
   */
  setState(state: State): void {
    this.state = state;
  }

  /**
   * Determines whether the task is running.
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Determines whether the task is paused.
   */
  isPaused(): boolean {
    return this.status === 'paused';
  }

  /**
   * Determines whether the task is stopped.
   */
  isStopped(): boolean {
    return this.status === 'stopped';
  }

  /**
   * Gets the current status of the task.
   */
  getStatus(): TaskStatus {
    return this.status;
  }

  /**
   * Resolves when the task begins running again.
   */
  async waitUntilIsRunning(): Promise<void> {
    await this.onRunning.promise;
  }

  /**
   * Resolves when the task is stopped, and returns the product if there is one.
   */
  async waitUntilIsStopped(): Promise<Optional<Product>> {
    return await this.onStop.promise;
  }
}
