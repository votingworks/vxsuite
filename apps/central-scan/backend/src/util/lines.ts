import { EventEmitter } from 'node:events';

interface LineEmitter {
  on(event: 'line', callback: (line: string) => void): this;
  emit(event: 'line', line: string): boolean;
}

/**
 * Takes string chunks as input and emits full lines as output. On end, emits
 * any partial line that may remain.
 *
 * @example
 *
 * const lines = []
 * new Lines()
 *   .on('line', (line) => lines.push(line))
 *   .add('Hello ')
 *   .add('World')
 *   .add('\n- anonymous')
 *   .end()
 * console.log(lines) // ['Hello World\n', '- anonymous']
 */
export class Lines extends EventEmitter implements LineEmitter {
  private buffer = '';

  constructor(private readonly terminator = '\n') {
    super();
  }

  add(data: string): void {
    let cursor = 0;
    let nextTerminator: number;

    for (;;) {
      nextTerminator = data.indexOf(this.terminator, cursor);
      if (nextTerminator < 0) {
        break;
      }
      const { buffer } = this;
      this.buffer = '';
      const line =
        buffer + data.slice(cursor, nextTerminator + this.terminator.length);
      this.emit('line', line);
      cursor = nextTerminator + this.terminator.length;
    }

    this.buffer += data.slice(cursor);
  }

  end(): void {
    if (this.buffer.length) {
      this.emit('line', this.buffer);
      this.buffer = '';
    }
  }
}
