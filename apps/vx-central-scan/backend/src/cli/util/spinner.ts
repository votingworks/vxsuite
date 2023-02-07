import { Ora } from 'ora';

export interface TextProvider<P extends unknown[] = []> {
  init?(update: () => void): (() => void) | void;
  toString(...props: P): string;
}

export class Spinner {
  private readonly parts: readonly TextProvider[];
  private readonly deinits: ReadonlyArray<() => void>;

  constructor(private readonly spinner: Ora, ...parts: TextProvider[]) {
    this.parts = parts;
    const update = (): void => this.update();
    this.deinits = parts
      .map((part) => part.init?.(update))
      .filter((deinit): deinit is () => void => !!deinit);
  }

  update(): void {
    this.spinner.text = this.parts.map((part) => part.toString()).join('');
  }

  succeed(): void {
    this.spinner.succeed();
    for (const deinit of this.deinits) {
      deinit();
    }
  }
}

export function durationProvider({
  minDisplayDuration = 3000,
  prefix = '',
  suffix = '',
}: {
  minDisplayDuration?: number;
  prefix?: string;
  suffix?: string;
} = {}): TextProvider<[duration: number] | []> {
  const start = new Date();
  return {
    init: (update): (() => void) => {
      const timer = setInterval(update, 1000);
      return (): void => clearInterval(timer);
    },

    // eslint-disable-next-line vx/gts-safe-number-parse
    toString: (duration = +new Date() - +start): string => {
      if (duration >= minDisplayDuration) {
        const parts: string[] = [];
        let remaining = Math.floor(duration / 1000);

        const hours = Math.floor(remaining / (60 * 60));
        if (hours > 0) {
          parts.push(`${hours}h`);
          remaining -= hours * 60 * 60;
        }

        const minutes = Math.floor(remaining / 60);
        if (minutes > 0) {
          parts.push(`${minutes}m`);
          remaining -= minutes * 60;
        }

        if (remaining > 0) {
          parts.push(`${remaining}s`);
        }
        return `${prefix}${parts.join(' ')}${suffix}`;
      }

      return '';
    },
  };
}

export interface CountProvider extends TextProvider<[value: number] | []> {
  increment(): void;
}

export function countProvider({ start = 0 } = {}): CountProvider {
  let current = start;
  let doUpdate: (() => void) | undefined;

  return {
    init: (update): void => {
      doUpdate = update;
    },

    increment: (): void => {
      current += 1;
      doUpdate?.();
    },

    toString: (value = current): string => value.toString(),
  };
}
