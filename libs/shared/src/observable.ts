/**
 * Alias for `KioskBrowser.Observable`.
 */
export type Observable<T> = KioskBrowser.Observable<T>;

/**
 * A simple `Observable` that allows pushing new values and emits the last value
 * when a subscriber subscribes.
 */
export class BehaviorSubject<T> implements Observable<T> {
  private currentValue: T;
  private readonly subscriptions = new Set<(value: T) => void>();

  constructor(initialValue: T) {
    this.currentValue = initialValue;
  }

  /**
   * Push a new value to all subscribers.
   */
  next(value: T): void {
    this.currentValue = value;
    for (const subscription of this.subscriptions) {
      subscription(value);
    }
  }

  /**
   * Register a new subscriber. Calls the callback with the current value.
   * Returns a function to unsubscribe.
   */
  subscribe(callback: (value: T) => void): () => void {
    this.subscriptions.add(callback);
    callback(this.currentValue);
    return () => this.subscriptions.delete(callback);
  }
}
