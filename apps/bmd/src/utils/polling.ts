export interface Poller {
  stop(): void
}

export class IntervalPoller implements Poller {
  private duration: number
  private callback: () => Promise<void> | void
  private interval?: ReturnType<typeof setTimeout>

  public constructor(duration: number, callback: () => Promise<void> | void) {
    this.duration = duration
    this.callback = callback
  }

  public start(): this {
    if (!this.interval) {
      this.pollForever()
    }

    return this
  }

  public stop(): this {
    window.clearInterval(this.interval)
    this.interval = undefined
    return this
  }

  private pollForever(): void {
    this.interval = window.setInterval(async () => {
      try {
        await this.callback()
      } catch (error) {
        // ignore errors for now
      }
    }, this.duration)
  }

  public static start(
    interval: number,
    callback: () => Promise<void> | void
  ): IntervalPoller {
    return new IntervalPoller(interval, callback).start()
  }
}
