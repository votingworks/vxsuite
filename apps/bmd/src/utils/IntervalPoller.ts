export default class IntervalPoller {
  private interval: number
  private callback: () => Promise<void> | void
  private timeout?: ReturnType<typeof global.setTimeout>

  public constructor(duration: number, callback: () => Promise<void> | void) {
    this.interval = duration
    this.callback = callback
  }

  public start(): this {
    if (!this.timeout) {
      this.scheduleNextTick()
    }

    return this
  }

  public stop(): this {
    if (this.timeout) {
      global.clearTimeout(this.timeout)
      this.timeout = undefined
    }
    return this
  }

  public isRunning(): boolean {
    return typeof this.timeout !== 'undefined'
  }

  private scheduleNextTick(): void {
    this.timeout = global.setTimeout(async () => {
      try {
        await this.callback()
      } catch (error) {
        // ignore errors for now
      } finally {
        if (this.isRunning()) {
          this.scheduleNextTick()
        }
      }
    }, this.interval)
  }

  public static start(
    interval: number,
    callback: () => Promise<void> | void
  ): IntervalPoller {
    return new IntervalPoller(interval, callback).start()
  }
}
