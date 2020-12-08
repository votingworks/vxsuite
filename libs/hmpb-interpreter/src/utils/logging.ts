import { Point, Rect } from '../types'
import makeDebug, { Debugger } from 'debug'

export interface ImageLogger {
  feature(point: Point, message?: string): FeatureImageLogger
  feature(rect: Rect, message?: string): FeatureImageLogger
  temp(point: Point, message?: string): this
  temp(rect: Rect, message?: string): this
  group(name: string): GroupedImageLogger
}

export interface GroupedImageLogger extends ImageLogger {
  end(message?: string): void
}

export interface FeatureImageLogger {
  update(point: Point, message?: string): this
  update(rect: Rect, message?: string): this
  commit(message?: string): this
  cancel(message?: string): this
}

class ConsoleImageLogger implements ImageLogger {
  public feature(shape: Point | Rect, message = 'feature'): FeatureImageLogger {
    return new ConsoleFeatureLogger(shape, message)
  }

  public temp(shape: Point | Rect, message = 'temp'): this {
    this.feature(shape, message).cancel()
    return this
  }

  public group(name: string): GroupedImageLogger {
    return new ConsoleGroupedLogger(name)
  }
}

class ConsoleFeatureLogger
  extends ConsoleImageLogger
  implements FeatureImageLogger {
  public constructor(
    private shape: Point | Rect,
    private readonly featureMessage: string
  ) {
    super()
    console.log('BEGIN', featureMessage, shape)
  }

  public update(shape: Point | Rect, message = ''): this {
    this.shape = shape
    console.log('UPDATE', this.featureMessage, message, this.shape)
    return this
  }

  public commit(message = ''): this {
    console.log('COMMIT', this.featureMessage, message, this.shape)
    return this
  }

  public cancel(message = ''): this {
    console.log('CANCEL', this.featureMessage, message, this.shape)
    return this
  }
}

class ConsoleGroupedLogger
  extends ConsoleImageLogger
  implements GroupedImageLogger {
  public constructor(name: string) {
    super()
    console.group(name)
  }

  public end(message?: string): void {
    if (message) {
      console.log(message)
    }
    console.groupEnd()
  }
}

export function makeConsoleImageLogger(): ImageLogger {
  return new ConsoleImageLogger()
}

class DebugImageLogger implements ImageLogger {
  public constructor(
    private readonly namespace = 'hmpb-interpreter:image-log'
  ) {}

  public feature(point: Point, message?: string): FeatureImageLogger
  public feature(rect: Rect, message?: string): FeatureImageLogger
  public feature(shape: Point | Rect, message = 'feature'): FeatureImageLogger {
    return new DebugFeatureImageLogger(shape, `${this.namespace}:${message}`)
  }

  public temp(point: Point, message?: string): this
  public temp(rect: Rect, message?: string): this
  public temp(shape: Point | Rect, message = 'temp'): this {
    makeDebug(`${this.namespace}:${message}`)('%s %o', message, shape)
    return this
  }

  public group(name: string): GroupedImageLogger {
    return new DebugGroupedImageLogger(`${this.namespace}:${name}`)
  }
}

class DebugGroupedImageLogger
  extends DebugImageLogger
  implements GroupedImageLogger {
  private debug: Debugger

  public constructor(namespace: string) {
    super(namespace)
    this.debug = makeDebug(namespace)
  }

  public end(message?: string): void {
    if (message) {
      this.debug('%s', message)
    }
  }
}

class DebugFeatureImageLogger
  extends DebugImageLogger
  implements FeatureImageLogger {
  private debug: Debugger

  public constructor(private shape: Point | Rect, namespace: string) {
    super()
    this.debug = makeDebug(namespace)
    this.debug('BEGIN %o', shape)
  }

  public update(shape: Point | Rect, message = ''): this {
    this.shape = shape
    this.debug('UPDATE %s %o', message, this.shape)
    return this
  }

  public commit(message = ''): this {
    this.debug('COMMIT %s %o', message, this.shape)
    return this
  }

  public cancel(message = ''): this {
    this.debug('CANCEL', message, this.shape)
    return this
  }
}

export function makeDebugImageLogger(): ImageLogger {
  return new DebugImageLogger()
}
