import makeDebug from 'debug'
import { Printer, PrintOptions } from '../../config/types'

const debug = makeDebug('election-manager:printer')

export default class LocalPrinter implements Printer {
  public async print(options: PrintOptions): Promise<void> {
    debug('ignoring options given to print: %o', options)
    window.print()
  }
}
