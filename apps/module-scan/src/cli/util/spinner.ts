import { Ora } from 'ora'

export interface TextProvider<P extends unknown[] = []> {
  init?(update: () => void): (() => void) | void
  toString(...props: P): string
}

export default class Spinner {
  private readonly spinner: Ora
  private readonly parts: readonly TextProvider[]
  private readonly deinits: readonly (() => void)[]

  public constructor(spinner: Ora, ...parts: TextProvider[]) {
    this.parts = parts
    this.spinner = spinner
    const update = (): void => this.update()
    this.deinits = parts
      .map((part) => part.init?.(update))
      .filter((deinit): deinit is () => void => !!deinit)
  }

  public update(): void {
    this.spinner.text = this.parts.map((part) => part.toString()).join('')
  }

  public succeed(): void {
    this.spinner.succeed()
    for (const deinit of this.deinits) {
      deinit()
    }
  }
}

export function durationProvider({
  minDisplayDuration = 3000,
  prefix = '',
  suffix = '',
}: {
  minDisplayDuration?: number
  prefix?: string
  suffix?: string
} = {}): TextProvider<[duration: number] | []> {
  const start = new Date()
  return {
    init: (update): (() => void) => {
      const timer = setInterval(update, 1000)
      return (): void => clearInterval(timer)
    },

    toString: (duration = +new Date() - +start): string => {
      if (duration >= minDisplayDuration) {
        const parts: string[] = []
        let remaining = Math.floor(duration / 1000)

        const hours = Math.floor(remaining / (60 * 60))
        if (hours > 0) {
          parts.push(`${hours}h`)
          remaining -= hours * 60 * 60
        }

        const minutes = Math.floor(remaining / 60)
        if (minutes > 0) {
          parts.push(`${minutes}m`)
          remaining -= minutes * 60
        }

        if (remaining > 0) {
          parts.push(`${remaining}s`)
        }
        return `${prefix}${parts.join(' ')}${suffix}`
      } else {
        return ''
      }
    },
  }
}

export interface CountProvider extends TextProvider<[value: number] | []> {
  increment(): void
}

export function countProvider({ start = 0 } = {}): CountProvider {
  let current = start
  let doUpdate: (() => void) | undefined

  return {
    init: (update): void => {
      doUpdate = update
    },

    increment: (): void => {
      current++
      doUpdate?.()
    },

    toString: (value = current): string => value.toString(),
  }
}
