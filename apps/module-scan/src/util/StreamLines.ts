import { Readable } from 'stream';
import Lines from './Lines';

export default class StreamLines extends Lines {
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
