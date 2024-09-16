import { Readable } from 'node:stream';
import { Lines } from './lines';

export class StreamLines extends Lines {
  constructor(input: Readable, terminator?: string) {
    super(terminator);

    input
      .on('readable', () => {
        const chunk = input.read();
        if (typeof chunk === 'string') {
          this.add(chunk);
        }
      })
      .once('close', () => {
        this.end();
      });
  }
}
