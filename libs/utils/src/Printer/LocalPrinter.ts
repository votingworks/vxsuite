import makeDebug from 'debug'
import { Printer, PrintOptions } from '../types'

const debug = makeDebug('utils:printer')

export default class LocalPrinter implements Printer {
  async print(options: PrintOptions): Promise<void> {
    debug('ignoring options given to print: %o', options)
    window.print()
  }
}
